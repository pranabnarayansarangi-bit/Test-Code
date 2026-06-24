import { DB } from '../store/db';
import { ActionItemRow, getLatestDraft } from '../store/actions';
import { getChat } from '../store/messages';

const PRIORITY_BADGE: Record<string, string> = {
  high: '🔴 HIGH',
  normal: '🟡',
  low: '⚪️',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatDue(dueAt: number | null): string {
  if (!dueAt) return '';
  const d = new Date(dueAt * 1000);
  return ` · ⏰ due ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

/** A single action item rendered for Telegram (HTML parse mode). */
export function formatActionItem(db: DB, item: ActionItemRow): string {
  const chat = getChat(db, item.chat_id);
  const draft = getLatestDraft(db, item.id);
  const badge = PRIORITY_BADGE[item.priority] ?? '🟡';
  const lines = [
    `${badge} <b>${escapeHtml(item.summary)}</b>`,
    `<i>${escapeHtml(chat?.name ?? 'chat')}</i>${
      item.requested_by ? ` · from ${escapeHtml(item.requested_by)}` : ''
    }${formatDue(item.due_at)}`,
  ];
  if (draft) {
    lines.push('');
    lines.push(`💬 <b>Suggested reply:</b>`);
    lines.push(`<blockquote>${escapeHtml(draft.draft_text)}</blockquote>`);
  }
  return lines.join('\n');
}

export function formatDigest(db: DB, items: ActionItemRow[], title: string): string {
  if (items.length === 0) return `<b>${escapeHtml(title)}</b>\n\nNothing pending. ✅`;
  const header = `<b>${escapeHtml(title)}</b> — ${items.length} item(s)\n`;
  const body = items
    .map((it, i) => {
      const chat = getChat(db, it.chat_id);
      const badge = PRIORITY_BADGE[it.priority] ?? '🟡';
      return `${i + 1}. ${badge} ${escapeHtml(it.summary)} <i>(${escapeHtml(
        chat?.name ?? 'chat',
      )})</i>${formatDue(it.due_at)}`;
    })
    .join('\n');
  return `${header}\n${body}\n\nUse /pending to act on these.`;
}
