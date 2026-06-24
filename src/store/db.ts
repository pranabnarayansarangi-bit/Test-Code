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
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id           INTEGER NOT NULL REFERENCES chats(id),
  message_id        INTEGER REFERENCES messages(id),
  summary           TEXT NOT NULL,
  requested_by      TEXT,
  suggested_owner   TEXT,                            -- who should action it (team/person)
  due_at            INTEGER,                         -- unix seconds, nullable
  priority          TEXT NOT NULL DEFAULT 'P2',      -- 'P1' | 'P2' | 'P3'
  awaiting_decision INTEGER NOT NULL DEFAULT 0,      -- needs the owner's decision/approval
  is_risk           INTEGER NOT NULL DEFAULT 0,      -- operational risk (stock/PO/payment)
  confidence        REAL NOT NULL DEFAULT 1.0,       -- 0..1 triage confidence
  status            TEXT NOT NULL DEFAULT 'open',    -- 'open'|'done'|'snoozed'|'dismissed'|'archived'
  created_at        INTEGER NOT NULL,
  notified          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_actions_status ON action_items(status);

CREATE TABLE IF NOT EXISTS decisions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  action_item_id    INTEGER NOT NULL REFERENCES action_items(id),
  original_message  TEXT,
  draft_text        TEXT,
  final_text        TEXT NOT NULL,
  edited            INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT,
  created_at        INTEGER NOT NULL
);

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
  migrate(db);
  instance = db;
  return db;
}

/**
 * Add Phase 2 columns to a Phase 1 database and remap the old priority values.
 * CREATE TABLE IF NOT EXISTS can't alter an existing table, so we patch in place.
 */
function migrate(db: DB): void {
  const cols = new Set(
    (db.prepare(`PRAGMA table_info(action_items)`).all() as { name: string }[]).map((c) => c.name),
  );
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE action_items ADD COLUMN ${ddl}`);
  };
  add('suggested_owner', 'suggested_owner TEXT');
  add('awaiting_decision', 'awaiting_decision INTEGER NOT NULL DEFAULT 0');
  add('is_risk', 'is_risk INTEGER NOT NULL DEFAULT 0');
  add('confidence', 'confidence REAL NOT NULL DEFAULT 1.0');

  // Remap legacy priority values (high/normal/low) to the P1/P2/P3 bands.
  db.exec(`UPDATE action_items SET priority='P1' WHERE priority='high'`);
  db.exec(`UPDATE action_items SET priority='P2' WHERE priority='normal'`);
  db.exec(`UPDATE action_items SET priority='P3' WHERE priority='low'`);
}
