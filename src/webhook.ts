import http from 'node:http';
import { normalizeAddress } from './config.js';
import { log } from './log.js';

interface Attachment {
  guid: string;
  transferName: string;
  mimeType: string | null;
  totalBytes: number;
}

export interface InboundMessage {
  chatGuid: string;
  sender: string;
  text: string | null;
  attachments: Attachment[];
}

export interface WebhookServerOptions {
  port: number;
  host: string;
  password: string | undefined;
  allowedSenders: Set<string>;
  onMessage: (msg: InboundMessage) => void;
}

const MAX_BODY = 1024 * 1024; // 1 MB

export function startWebhookServer(opts: WebhookServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/webhook')) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (opts.password) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.searchParams.get('pwd') !== opts.password) {
        res.writeHead(401);
        res.end();
        return;
      }
    }

    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      res.writeHead(200);
      res.end();

      let event: { type: string; data: Record<string, unknown> };
      try {
        event = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        log.warn('webhook', 'invalid JSON payload');
        return;
      }

      if (event.type === 'hello-world') {
        log.debug('webhook', 'hello-world received');
        return;
      }

      if (event.type !== 'new-message') return;

      const data = event.data as Record<string, unknown>;

      if (data.isFromMe) return;

      const handle = data.handle as { address?: string } | null;
      const sender = handle?.address;
      if (!sender) return;

      if (opts.allowedSenders.size > 0) {
        const normalized = normalizeAddress(sender);
        if (!opts.allowedSenders.has(normalized)) {
          log.warn('webhook', `dropping message from non-allowlisted sender: ${sender}`);
          return;
        }
      }

      const chats = data.chats as Array<{ guid: string }> | undefined;
      const chatGuid = chats?.[0]?.guid;
      if (!chatGuid) return;

      const text = (data.text as string | null) ?? null;
      const attachments = (data.attachments as Attachment[] | undefined) ?? [];

      if (!text && attachments.length === 0) return;

      opts.onMessage({ chatGuid, sender, text, attachments });
    });
  });

  server.listen(opts.port, opts.host, () => {
    log.info('webhook', `listening on ${opts.host}:${opts.port}`);
  });

  return server;
}
