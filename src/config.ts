import { z } from 'zod';
import os from 'node:os';
import path from 'node:path';

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

const configSchema = z.object({
  BB_SERVER_URL: z.string().url(),
  BB_PASSWORD: z.string().min(1),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(8787),
  WEBHOOK_PUBLIC_URL: z.string().optional(),
  ALLOWED_SENDERS: z.string().optional(),
  ATTACHMENTS_DIR: z.string().default('./attachments'),
});

export interface Config {
  bbServerUrl: string;
  bbPassword: string;
  webhookPort: number;
  webhookPublicUrl: string;
  allowedSenders: Set<string>;
  attachmentsDir: string;
}

export function loadConfig(): Config {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env is optional — env vars may be set directly
  }

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    process.stderr.write(`[bluebubbles] config error:\n${issues}\n`);
    process.exit(1);
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
    process.stderr.write(
      '[bluebubbles] WARNING: ALLOWED_SENDERS is empty — accepting messages from ALL senders. ' +
      'Set ALLOWED_SENDERS in .env to restrict access.\n',
    );
  }

  const port = env.WEBHOOK_PORT;
  let publicUrl = env.WEBHOOK_PUBLIC_URL;
  if (!publicUrl) {
    const ip = detectLanIPv4();
    if (ip) {
      publicUrl = `http://${ip}:${port}/webhook`;
    } else {
      publicUrl = `http://localhost:${port}/webhook`;
      process.stderr.write('[bluebubbles] WARNING: could not auto-detect LAN IPv4; using localhost\n');
    }
  }

  return {
    bbServerUrl: env.BB_SERVER_URL.replace(/\/+$/, ''),
    bbPassword: env.BB_PASSWORD,
    webhookPort: port,
    webhookPublicUrl: publicUrl,
    allowedSenders: senders,
    attachmentsDir: path.resolve(env.ATTACHMENTS_DIR),
  };
}
