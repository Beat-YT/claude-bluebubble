import { z } from 'zod';
import os from 'node:os';
import path from 'node:path';
import { log } from './log.js';

export function normalizeAddress(addr: string): string {
  return addr.includes('@')
    ? addr.trim().toLowerCase()
    : addr.replace(/[\s\-()]/g, '');
}

function detectLanIPv4(): string | undefined {
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.family === 'IPv4' && !e.internal) return e.address;
    }
  }
  return undefined;
}

function convertIssueToString(issue: z.ZodIssue[]): string {
  return issue.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
}

const configSchema = z.object({
  BB_SERVER_URL: z.string().url(),
  BB_PASSWORD: z.string().min(1),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(8787),
  WEBHOOK_PUBLIC_URL: z.string().optional(),
  ALLOWED_SENDERS: z.string().optional(),
  ATTACHMENTS_DIR: z.string().default('./attachments'),
  WEBHOOK_PWD: z.string().optional(),
  WEBHOOK_HOST: z.string().default('127.0.0.1'),
});

export interface Config {
  bbServerUrl: string;
  bbPassword: string;
  webhookPort: number;
  webhookPublicUrl: string;
  allowedSenders: Set<string>;
  attachmentsDir: string;
  webhookPassword: string | undefined;
  webhookHost: string;
}

export function loadConfig(): Config {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env is optional — env vars may be set directly
  }

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = convertIssueToString(parsed.error.issues);
    log.error('config', `invalid configuration:\n${issues}`);
    return process.exit(1);
  }

  const env = parsed.data;

  const senders = new Set<string>();
  if (env.ALLOWED_SENDERS) {
    for (const s of env.ALLOWED_SENDERS.split(',')) {
      const normalized = normalizeAddress(s);
      if (normalized) senders.add(normalized);
    }
  }
  if (senders.size === 0) {
    log.warn('config', 'ALLOWED_SENDERS is empty — accepting messages from ALL senders. Set ALLOWED_SENDERS in .env to restrict access.');
  }

  const port = env.WEBHOOK_PORT;
  const host = env.WEBHOOK_HOST;
  let publicUrl = env.WEBHOOK_PUBLIC_URL;
  if (!publicUrl) {
    if (host === '127.0.0.1' || host === 'localhost') {
      publicUrl = `http://127.0.0.1:${port}/webhook`;
    } else {
      const ip = detectLanIPv4();
      if (ip) {
        publicUrl = `http://${ip}:${port}/webhook`;
      } else {
        publicUrl = `http://localhost:${port}/webhook`;
        log.warn('config', 'could not auto-detect LAN IPv4; using localhost');
      }
    }
  }

  if (env.WEBHOOK_PWD) {
    if (!publicUrl.includes('?')) {
      publicUrl += `?pwd=${encodeURIComponent(env.WEBHOOK_PWD)}`;
    }
  }

  return {
    bbServerUrl: env.BB_SERVER_URL.replace(/\/+$/, ''),
    bbPassword: env.BB_PASSWORD,
    webhookPort: port,
    webhookPublicUrl: publicUrl,
    allowedSenders: senders,
    attachmentsDir: path.resolve(env.ATTACHMENTS_DIR),
    webhookPassword: env.WEBHOOK_PWD,
    webhookHost: env.WEBHOOK_HOST,
  };
}
