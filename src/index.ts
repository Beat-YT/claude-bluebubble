import { loadConfig } from './config.js';
import { BlueBubblesClient } from './bluebubbles.js';
import { startWebhookServer } from './webhook.js';
import { createChannel } from './channel.js';

const TYPING_TIMEOUT_MS = 2 * 60 * 1000;

const config = loadConfig();

const bb = new BlueBubblesClient({
  serverUrl: config.bbServerUrl,
  password: config.bbPassword,
  attachmentsDir: config.attachmentsDir,
});

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTypingTimer(chatGuid: string) {
  const timer = typingTimers.get(chatGuid);
  if (timer) {
    clearTimeout(timer);
    typingTimers.delete(chatGuid);
  }
}

function handleReply(chatGuid: string) {
  clearTypingTimer(chatGuid);
  bb.stopTyping(chatGuid);
}

const channel = createChannel(bb, { onReply: handleReply });

await channel.connect();

startWebhookServer({
  port: config.webhookPort,
  allowedSenders: config.allowedSenders,
  onMessage: async (msg) => {
    try {
      bb.markRead(msg.chatGuid);
      bb.startTyping(msg.chatGuid);

      clearTypingTimer(msg.chatGuid);
      typingTimers.set(msg.chatGuid, setTimeout(() => {
        bb.stopTyping(msg.chatGuid);
        typingTimers.delete(msg.chatGuid);
      }, TYPING_TIMEOUT_MS));

      const attachmentPaths: string[] = [];
      for (const att of msg.attachments) {
        try {
          const localPath = await bb.downloadAttachment(att.guid, att.transferName);
          attachmentPaths.push(localPath);
        } catch (e) {
          process.stderr.write(`[bluebubbles] failed to download attachment ${att.guid}: ${e}\n`);
        }
      }

      await channel.forwardMessage({
        chatGuid: msg.chatGuid,
        sender: msg.sender,
        text: msg.text,
        attachmentPaths,
      });
    } catch (e) {
      process.stderr.write(`[bluebubbles] error processing message: ${e}\n`);
    }
  },
});

// Startup handshake — non-fatal so the MCP server works even if the Mac is offline
try {
  await bb.ping();
  process.stderr.write('[bluebubbles] connected to BlueBubbles server\n');
  await bb.registerWebhook(config.webhookPublicUrl);
} catch (e) {
  process.stderr.write(`[bluebubbles] startup handshake failed (will retry on first message): ${e}\n`);
}
