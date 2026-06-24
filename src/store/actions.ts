import { DB } from './db';

export type Priority = 'high' | 'normal' | 'low';
export type ActionStatus = 'open' | 'done' | 'snoozed' | 'dismissed';

export interface ActionItemRow {
  id: number;
  chat_id: number;
  message_id: number | null;
  summary: string;
  requested_by: string | null;
  due_at: number | null;
  priority: Priority;
  status: ActionStatus;
  created_at: number;
  notified: number;
}

export interface DraftRow {
  id: number;
  action_item_id: number;
  draft_text: string;
  model: string | null;
  approved: number;
  sent: number;
  created_at: number;
}

export interface CreateActionInput {
  chatId: number;
  messageId: number | null;
  summary: string;
  requestedBy?: string;
  dueAt?: number | null;
  priority?: Priority;
  draftText?: string;
  model?: string;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Create an action item plus its optional draft reply. Returns the new action id. */
export function createActionItem(db: DB, input: CreateActionInput): number {
  const created = nowSec();
  const actionId = db
    .prepare(
      `INSERT INTO action_items
         (chat_id, message_id, summary, requested_by, due_at, priority, status, created_at)
       VALUES (@chatId, @messageId, @summary, @requestedBy, @dueAt, @priority, 'open', @created)`,
    )
    .run({
      chatId: input.chatId,
      messageId: input.messageId,
      summary: input.summary,
      requestedBy: input.requestedBy ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? 'normal',
      created,
    }).lastInsertRowid;

  const id = Number(actionId);
  if (input.draftText) {
    db.prepare(
      `INSERT INTO drafts (action_item_id, draft_text, model, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, input.draftText, input.model ?? null, created);
  }
  return id;
}

export function getAction(db: DB, id: number): ActionItemRow | undefined {
  return db.prepare('SELECT * FROM action_items WHERE id = ?').get(id) as
    | ActionItemRow
    | undefined;
}

export function getLatestDraft(db: DB, actionId: number): DraftRow | undefined {
  return db
    .prepare('SELECT * FROM drafts WHERE action_item_id = ? ORDER BY id DESC LIMIT 1')
    .get(actionId) as DraftRow | undefined;
}

export function setStatus(db: DB, id: number, status: ActionStatus): void {
  db.prepare('UPDATE action_items SET status = ? WHERE id = ?').run(status, id);
}

export function markNotified(db: DB, id: number): void {
  db.prepare('UPDATE action_items SET notified = 1 WHERE id = ?').run(id);
}

export function approveDraft(db: DB, actionId: number): void {
  db.prepare('UPDATE drafts SET approved = 1 WHERE action_item_id = ?').run(actionId);
}

export function snooze(db: DB, id: number, untilSec: number): void {
  setStatus(db, id, 'snoozed');
  db.prepare('INSERT INTO reminders (action_item_id, fire_at) VALUES (?, ?)').run(id, untilSec);
}

/** Open items that have not yet been pushed to the user. */
export function getUnnotifiedOpen(db: DB): ActionItemRow[] {
  return db
    .prepare(`SELECT * FROM action_items WHERE status = 'open' AND notified = 0 ORDER BY id ASC`)
    .all() as ActionItemRow[];
}

/** All currently open or snoozed items (for digests / /pending). */
export function getOpenItems(db: DB): ActionItemRow[] {
  return db
    .prepare(
      `SELECT * FROM action_items WHERE status IN ('open','snoozed')
       ORDER BY (priority = 'high') DESC, COALESCE(due_at, 9999999999) ASC, id ASC`,
    )
    .all() as ActionItemRow[];
}

/** Items due today (local), based on due_at within [startSec, endSec]. */
export function getItemsDueBetween(db: DB, startSec: number, endSec: number): ActionItemRow[] {
  return db
    .prepare(
      `SELECT * FROM action_items
       WHERE status IN ('open','snoozed') AND due_at IS NOT NULL
         AND due_at BETWEEN ? AND ?
       ORDER BY due_at ASC`,
    )
    .all(startSec, endSec) as ActionItemRow[];
}

/** Snoozed reminders whose time has arrived. Marks them fired and returns the actions. */
export function popDueReminders(db: DB): ActionItemRow[] {
  const now = nowSec();
  const due = db
    .prepare('SELECT * FROM reminders WHERE fired = 0 AND fire_at <= ?')
    .all(now) as { id: number; action_item_id: number }[];
  const actions: ActionItemRow[] = [];
  const markFired = db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?');
  for (const r of due) {
    markFired.run(r.id);
    const action = getAction(db, r.action_item_id);
    if (action && (action.status === 'snoozed' || action.status === 'open')) {
      setStatus(db, action.id, 'open');
      actions.push(action);
    }
  }
  return actions;
}
