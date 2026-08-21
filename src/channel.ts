import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import type { BlueBubblesClient } from './bluebubbles.js';
import { log } from './log.js';

const INSTRUCTIONS = `You are connected to iMessage via a BlueBubbles bridge.

Incoming messages appear as:
  <channel source="bluebubbles" chat_id="<chatGuid>" sender="<address>">
    message text here
    [attachment saved: /path/to/file (image/jpeg)]
  </channel>

To reply, call the "reply" tool with chat_id (from the tag) and your text.
To send a file, call the "send_file" tool with chat_id and file_path (an absolute path on this machine).
Always use the chat_id from the incoming message tag.`;

export interface ChannelCallbacks {
  onReply: (chatGuid: string) => void;
}

export function createChannel(bb: BlueBubblesClient, callbacks: ChannelCallbacks) {
  const mcp = new McpServer(
    { name: 'bluebubbles', version: '0.1.0' },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
      },
      instructions: INSTRUCTIONS,
    },
  );

  mcp.registerTool(
    'reply',
    {
      description: 'Send a text message back over iMessage',
      inputSchema: { chat_id: z.string(), text: z.string() },
    },
    async ({ chat_id, text }) => {
      await bb.sendText(chat_id, text);
      callbacks.onReply(chat_id);

      return {
        content: [{ type: 'text' as const, text: 'sent' }]
      };
    },
  );

  mcp.registerTool(
    'send_file',
    {
      description: 'Send a file over iMessage',
      inputSchema: { chat_id: z.string(), file_path: z.string() },
    },
    async ({ chat_id, file_path }) => {
      if (!fs.existsSync(file_path)) {
        return {
          content: [{ type: 'text', text: `file not found: ${file_path}` }],
          isError: true
        };
      }

      await bb.sendAttachment(chat_id, file_path);
      callbacks.onReply(chat_id);
      return {
        content: [{ type: 'text', text: `sent ${file_path}` }]
      };
    },
  );

  async function forwardMessage(msg: { chatGuid: string; sender: string; text: string | null; dateCreated: number | null; attachmentPaths: string[] }) {
    const lines: string[] = [];
    if (msg.text) lines.push(msg.text);
    for (const p of msg.attachmentPaths) {
      lines.push(`[attachment saved: ${p}]`);
    }

    const meta: Record<string, string> = {
      chat_id: msg.chatGuid,
      sender: msg.sender,
    };

    if (msg.dateCreated) {
      const d = new Date(msg.dateCreated);
      const pad = (n: number) => String(n).padStart(2, '0');
      meta.time = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    await mcp.server.notification({
      method: 'notifications/claude/channel',
      params: {
        content: lines.join('\n'),
        meta,
      },
    });
  }

  async function connect() {
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
    log.info('mcp', 'channel connected');
  }

  return { connect, forwardMessage };
}
