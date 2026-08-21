import { loadConfig } from './config.js';
import { BlueBubblesClient } from './bluebubbles.js';
import { startWebhookServer } from './webhook.js';
import { createChannel } from './channel.js';
import { log } from './log.js';

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
  host: config.webhookHost,
  password: config.webhookPassword,
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
          log.error('attachment', `failed to download ${att.guid}: ${e}`);
        }
      }

      await channel.forwardMessage({
        chatGuid: msg.chatGuid,
        sender: msg.sender,
        text: msg.text,
        dateCreated: msg.dateCreated,
        attachmentPaths,
      });
    } catch (e) {
      log.error('message', `error processing: ${e}`);
    }
  },
});

// Startup handshake — non-fatal so the MCP server works even if the Mac is offline
try {
  await bb.ping();
  log.info('api', 'connected to BlueBubbles server');
  await bb.registerWebhook(config.webhookPublicUrl);
} catch (e) {
  log.warn('api', `startup handshake failed (will retry on first message): ${e}`);
}
