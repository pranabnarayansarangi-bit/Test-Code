import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export type DB = Database.Database;

let instance: DB | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_jid      TEXT UNIQUE NOT NULL,
  name        TEXT,
  type        TEXT NOT NULL DEFAULT 'group',   -- 'group' | 'dm'
  monitored   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id       TEXT UNIQUE,                      -- WhatsApp message id, for dedupe
  chat_id     INTEGER NOT NULL REFERENCES chats(id),
  sender      TEXT,
  ts          INTEGER NOT NULL,                 -- unix seconds
  body        TEXT,
  media_type  TEXT,                             -- 'text' | 'image' | 'document' | ...
  analyzed    INTEGER NOT NULL DEFAULT 0,
  raw_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_analyzed ON messages(analyzed);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

CREATE TABLE IF NOT EXISTS action_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id       INTEGER NOT NULL REFERENCES chats(id),
  message_id    INTEGER REFERENCES messages(id),
  summary       TEXT NOT NULL,
  requested_by  TEXT,
  due_at        INTEGER,                         -- unix seconds, nullable
  priority      TEXT NOT NULL DEFAULT 'normal',  -- 'high' | 'normal' | 'low'
  status        TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'done' | 'snoozed' | 'dismissed'
  created_at    INTEGER NOT NULL,
  notified      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_actions_status ON action_items(status);

CREATE TABLE IF NOT EXISTS drafts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  action_item_id  INTEGER NOT NULL REFERENCES action_items(id),
  draft_text      TEXT NOT NULL,
  model           TEXT,
  approved        INTEGER NOT NULL DEFAULT 0,
  sent            INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  action_item_id  INTEGER NOT NULL REFERENCES action_items(id),
  fire_at         INTEGER NOT NULL,
  fired           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at, fired);
`;

export function getDb(dbPath: string): DB {
  if (instance) return instance;
  const dir = path.dirname(path.resolve(dbPath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.resolve(dbPath));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  instance = db;
  return db;
}
