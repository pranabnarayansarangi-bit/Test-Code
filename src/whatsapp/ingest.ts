import type { WASocket } from '@whiskeysockets/baileys';
import { DB } from '../store/db';
import { upsertChat, insertMessage } from '../store/messages';
import { normalize } from './normalize';
import { NarayanConfig, isMonitored } from '../config';

/**
 * Attach a handler that ingests incoming WhatsApp messages into the store.
 * Only messages from monitored chats are persisted (per config allowlist).
 */
export function attachIngest(sock: WASocket, db: DB, config: NarayanConfig): void {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = newly received; 'append' = history sync. Ingest both, dedupe by wa_id.
    if (type !== 'notify' && type !== 'append') return;

    for (const m of messages) {
      const norm = normalize(m);
      if (!norm) continue;
      if (norm.fromMe) continue; // don't action our own messages
      if (!norm.body) continue; // skip pure-media with no caption

      // Resolve a display name for the chat.
      const chatName = norm.isGroup
        ? m.key?.remoteJid && (await safeGroupSubject(sock, norm.chatJid))
        : norm.senderName;

      if (!isMonitored(config, chatName ?? undefined)) continue;

      const chat = upsertChat(db, {
        waJid: norm.chatJid,
        name: chatName ?? undefined,
        type: norm.isGroup ? 'group' : 'dm',
        monitored: true,
      });

      insertMessage(db, {
        waId: norm.waId,
        chatId: chat.id,
        sender: norm.senderName ?? norm.senderJid,
        ts: norm.ts,
        body: norm.body,
        mediaType: norm.mediaType,
        rawJson: JSON.stringify({ key: m.key }),
      });
    }
  });
}

const subjectCache = new Map<string, string>();

async function safeGroupSubject(sock: WASocket, jid: string): Promise<string | undefined> {
  if (subjectCache.has(jid)) return subjectCache.get(jid);
  try {
    const meta = await sock.groupMetadata(jid);
    if (meta?.subject) {
      subjectCache.set(jid, meta.subject);
      return meta.subject;
    }
  } catch {
    // Group metadata can fail (rate limits / not a participant) — ignore.
  }
  return undefined;
}
