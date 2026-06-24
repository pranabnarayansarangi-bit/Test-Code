import { DB } from './db';

export interface ChatRow {
  id: number;
  wa_jid: string;
  name: string | null;
  type: string;
  monitored: number;
}

export interface MessageRow {
  id: number;
  wa_id: string | null;
  chat_id: number;
  sender: string | null;
  ts: number;
  body: string | null;
  media_type: string | null;
  analyzed: number;
  raw_json: string | null;
}

export interface UpsertChatInput {
  waJid: string;
  name?: string;
  type: 'group' | 'dm';
  monitored: boolean;
}

export function upsertChat(db: DB, input: UpsertChatInput): ChatRow {
  db.prepare(
    `INSERT INTO chats (wa_jid, name, type, monitored)
     VALUES (@waJid, @name, @type, @monitored)
     ON CONFLICT(wa_jid) DO UPDATE SET
       name = COALESCE(excluded.name, chats.name),
       type = excluded.type,
       monitored = excluded.monitored`,
  ).run({
    waJid: input.waJid,
    name: input.name ?? null,
    type: input.type,
    monitored: input.monitored ? 1 : 0,
  });
  return db.prepare('SELECT * FROM chats WHERE wa_jid = ?').get(input.waJid) as ChatRow;
}

export interface InsertMessageInput {
  waId?: string;
  chatId: number;
  sender?: string;
  ts: number;
  body?: string;
  mediaType?: string;
  rawJson?: string;
}

/** Returns the inserted message id, or null if it was a duplicate. */
export function insertMessage(db: DB, input: InsertMessageInput): number | null {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO messages (wa_id, chat_id, sender, ts, body, media_type, raw_json)
       VALUES (@waId, @chatId, @sender, @ts, @body, @mediaType, @rawJson)`,
    )
    .run({
      waId: input.waId ?? null,
      chatId: input.chatId,
      sender: input.sender ?? null,
      ts: input.ts,
      body: input.body ?? null,
      mediaType: input.mediaType ?? 'text',
      rawJson: input.rawJson ?? null,
    });
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

export function getUnanalyzedMessages(db: DB, limit = 50): MessageRow[] {
  return db
    .prepare(
      `SELECT * FROM messages WHERE analyzed = 0 AND body IS NOT NULL AND body != ''
       ORDER BY ts ASC LIMIT ?`,
    )
    .all(limit) as MessageRow[];
}

export function markAnalyzed(db: DB, messageIds: number[]): void {
  if (messageIds.length === 0) return;
  const stmt = db.prepare('UPDATE messages SET analyzed = 1 WHERE id = ?');
  const tx = db.transaction((ids: number[]) => ids.forEach((id) => stmt.run(id)));
  tx(messageIds);
}

export function getChat(db: DB, chatId: number): ChatRow | undefined {
  return db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as ChatRow | undefined;
}
