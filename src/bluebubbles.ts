import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { log } from './log.js';

export interface BlueBubblesConfig {
  serverUrl: string;
  password: string;
  attachmentsDir: string;
}

interface ApiResponse<T = unknown> {
  status: number;
  message: string;
  data: T;
}

export class BlueBubblesClient {
  private baseUrl: string;
  private password: string;
  private attachmentsDir: string;

  constructor(config: BlueBubblesConfig) {
    this.baseUrl = config.serverUrl + '/api/v1';
    this.password = config.password;
    this.attachmentsDir = config.attachmentsDir;
  }

  private url(endpoint: string): string {
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${this.baseUrl}${endpoint}${sep}password=${encodeURIComponent(this.password)}`;
  }

  private async request<T = unknown>(endpoint: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(endpoint), init);
    const body = (await res.json()) as ApiResponse<T>;
    if (body.status < 200 || body.status >= 300) {
      throw new Error(`BlueBubbles API ${endpoint}: ${body.message}`);
    }
    return body.data;
  }

  async ping(): Promise<void> {
    await this.request('/ping');
  }

  async sendText(chatGuid: string, text: string): Promise<void> {
    await this.request('/message/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid,
        message: text,
        method: 'private-api',
      }),
    });
  }

  async sendAttachment(chatGuid: string, filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    const file = new Blob([await fsp.readFile(absPath)]);
    const form = new FormData();
    form.append('attachment', file, path.basename(absPath));
    form.append('chatGuid', chatGuid);
    form.append('name', path.basename(absPath));
    form.append('method', 'private-api');

    const res = await fetch(this.url('/message/attachment'), { method: 'POST', body: form });
    const body = (await res.json()) as ApiResponse;
    if (body.status < 200 || body.status >= 300) {
      throw new Error(`BlueBubbles send attachment: ${body.message}`);
    }
  }

  async downloadAttachment(guid: string, transferName: string): Promise<string> {
    await fsp.mkdir(this.attachmentsDir, { recursive: true });
    const safeName = transferName.replace(/[<>:"/\\|?*]/g, '_');
    const dest = path.join(this.attachmentsDir, `${guid.replace(/[<>:"/\\|?*]/g, '_')}-${safeName}`);

    const res = await fetch(this.url(`/attachment/${encodeURIComponent(guid)}/download`));
    if (!res.ok || !res.body) {
      throw new Error(`BlueBubbles download attachment ${guid}: ${res.status}`);
    }
    const readable = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    await pipeline(readable, fs.createWriteStream(dest));
    return path.resolve(dest);
  }

  async startTyping(chatGuid: string): Promise<void> {
    try {
      await this.request(`/chat/${encodeURIComponent(chatGuid)}/typing`, { method: 'POST' });
    } catch (e) {
      log.debug('typing', `startTyping failed (non-fatal): ${e}`);
    }
  }

  async stopTyping(chatGuid: string): Promise<void> {
    try {
      await this.request(`/chat/${encodeURIComponent(chatGuid)}/typing`, { method: 'DELETE' });
    } catch (e) {
      log.debug('typing', `stopTyping failed (non-fatal): ${e}`);
    }
  }

  async markRead(chatGuid: string): Promise<void> {
    try {
      await this.request(`/chat/${encodeURIComponent(chatGuid)}/read`, { method: 'POST' });
    } catch (e) {
      log.debug('api', `markRead failed (non-fatal): ${e}`);
    }
  }

  async registerWebhook(url: string): Promise<void> {
    interface Webhook { id: number; url: string; events: string[] }
    const existing = await this.request<Webhook[]>('/webhook');
    if (existing.some(w => w.url === url)) {
      log.info('webhook', `already registered: ${url}`);
      return;
    }

    await this.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, events: ['new-message'] }),
    });
    log.info('webhook', `registered: ${url}`);
  }
}
