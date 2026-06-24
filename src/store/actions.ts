import { DB } from './db';

export type Priority = 'P1' | 'P2' | 'P3';
export type ActionStatus = 'open' | 'done' | 'snoozed' | 'dismissed' | 'archived';

export interface ActionItemRow {
  id: number;
  chat_id: number;
  message_id: number | null;
  summary: string;
  requested_by: string | null;
  suggested_owner: string | null;
  due_at: number | null;
  priority: Priority;
  awaiting_decision: number;
  is_risk: number;
  confidence: number;
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

export interface DecisionRow {
  id: number;
  action_item_id: number;
  original_message: string | null;
  draft_text: string | null;
  final_text: string;
  edited: number;
  outcome: string | null;
  created_at: number;
}

export interface CreateActionInput {
  chatId: number;
  messageId: number | null;
  summary: string;
  requestedBy?: string;
  suggestedOwner?: string;
  dueAt?: number | null;
  priority?: Priority;
  awaitingDecision?: boolean;
  isRisk?: boolean;
  confidence?: number;
  status?: ActionStatus;
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
         (chat_id, message_id, summary, requested_by, suggested_owner, due_at, priority,
          awaiting_decision, is_risk, confidence, status, created_at)
       VALUES (@chatId, @messageId, @summary, @requestedBy, @suggestedOwner, @dueAt, @priority,
          @awaitingDecision, @isRisk, @confidence, @status, @created)`,
    )
    .run({
      chatId: input.chatId,
      messageId: input.messageId,
      summary: input.summary,
      requestedBy: input.requestedBy ?? null,
      suggestedOwner: input.suggestedOwner ?? null,
      dueAt: input.dueAt ?? null,
      priority: input.priority ?? 'P2',
      awaitingDecision: input.awaitingDecision ? 1 : 0,
      isRisk: input.isRisk ? 1 : 0,
      confidence: input.confidence ?? 1.0,
      status: input.status ?? 'open',
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

/** Attach (or replace with a newer) draft reply for an existing action item. */
export function attachDraft(db: DB, actionId: number, text: string, model?: string): void {
  db.prepare(
    `INSERT INTO drafts (action_item_id, draft_text, model, created_at) VALUES (?, ?, ?, ?)`,
  ).run(actionId, text, model ?? null, nowSec());
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

/**
 * Record an approved (or edited-then-approved) decision. This is the "decision memory"
 * that later teaches Narayan the owner's reply style.
 */
export function recordDecision(
  db: DB,
  input: {
    actionId: number;
    originalMessage?: string | null;
    draftText?: string | null;
    finalText: string;
    edited: boolean;
  },
): void {
  db.prepare(
    `INSERT INTO decisions (action_item_id, original_message, draft_text, final_text, edited, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.actionId,
    input.originalMessage ?? null,
    input.draftText ?? null,
    input.finalText,
    input.edited ? 1 : 0,
    nowSec(),
  );
}

/** Most recent approved decisions, newest first — used as few-shot style examples. */
export function getRecentDecisions(db: DB, limit = 8): DecisionRow[] {
  return db
    .prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT ?')
    .all(limit) as DecisionRow[];
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
       ORDER BY (priority = 'P1') DESC, COALESCE(due_at, 9999999999) ASC, id ASC`,
    )
    .all() as ActionItemRow[];
}

/** Open/snoozed items of a given priority band. */
export function getOpenByPriority(db: DB, priority: Priority): ActionItemRow[] {
  return db
    .prepare(
      `SELECT * FROM action_items WHERE status IN ('open','snoozed') AND priority = ?
       ORDER BY COALESCE(due_at, 9999999999) ASC, id ASC`,
    )
    .all(priority) as ActionItemRow[];
}

/** Open/snoozed items awaiting the owner's decision. */
export function getAwaitingDecision(db: DB): ActionItemRow[] {
  return db
    .prepare(
      `SELECT * FROM action_items WHERE status IN ('open','snoozed') AND awaiting_decision = 1
       ORDER BY id ASC`,
    )
    .all() as ActionItemRow[];
}

/** Open/snoozed items flagged as operational risks. */
export function getRisks(db: DB): ActionItemRow[] {
  return db
    .prepare(
      `SELECT * FROM action_items WHERE status IN ('open','snoozed') AND is_risk = 1
       ORDER BY id ASC`,
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
