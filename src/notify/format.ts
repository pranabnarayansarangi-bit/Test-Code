import { DB } from '../store/db';
import { ActionItemRow, getLatestDraft } from '../store/actions';
import { getChat } from '../store/messages';
import { NarayanConfig } from '../config';

const PRIORITY_BADGE: Record<string, string> = {
  P1: '🔴 P1',
  P2: '🟡 P2',
  P3: '⚪️ P3',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDue(dueAt: number | null): string {
  if (!dueAt) return '';
  const d = new Date(dueAt * 1000);
  return ` · ⏰ due ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function reviewFlag(item: ActionItemRow, config: NarayanConfig): string {
  return item.confidence < config.reviewThreshold ? '⚠ <b>Needs Review</b> · ' : '';
}

/** A single action item rendered for Telegram (HTML parse mode). */
export function formatActionItem(db: DB, item: ActionItemRow, config: NarayanConfig): string {
  const chat = getChat(db, item.chat_id);
  const draft = getLatestDraft(db, item.id);
  const badge = PRIORITY_BADGE[item.priority] ?? '🟡 P2';
  const tags = [
    item.awaiting_decision ? '🟢 Awaiting your decision' : '',
    item.is_risk ? '⚠️ Risk' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [
    `${reviewFlag(item, config)}${badge} <b>${escapeHtml(item.summary)}</b>`,
    `<i>${escapeHtml(chat?.name ?? 'chat')}</i>${
      item.requested_by ? ` · from ${escapeHtml(item.requested_by)}` : ''
    }${item.suggested_owner ? ` · ➡️ ${escapeHtml(item.suggested_owner)}` : ''}${formatDue(item.due_at)}`,
  ];
  if (tags) lines.push(tags);
  if (draft) {
    lines.push('');
    lines.push(`💬 <b>Suggested reply:</b>`);
    lines.push(`<blockquote>${escapeHtml(draft.draft_text)}</blockquote>`);
  }
  return lines.join('\n');
}

export function formatDigest(
  db: DB,
  items: ActionItemRow[],
  title: string,
  config: NarayanConfig,
): string {
  if (items.length === 0) return `<b>${escapeHtml(title)}</b>\n\nNothing pending. ✅`;
  const header = `<b>${escapeHtml(title)}</b> — ${items.length} item(s)\n`;
  const body = items
    .map((it, i) => {
      const chat = getChat(db, it.chat_id);
      const badge = PRIORITY_BADGE[it.priority] ?? '🟡 P2';
      return `${i + 1}. ${reviewFlag(it, config)}${badge} ${escapeHtml(it.summary)} <i>(${escapeHtml(
        chat?.name ?? 'chat',
      )})</i>${it.suggested_owner ? ` ➡️ ${escapeHtml(it.suggested_owner)}` : ''}${formatDue(it.due_at)}`;
    })
    .join('\n');
  return `${header}\n${body}\n\nUse /pending to act on these.`;
}
