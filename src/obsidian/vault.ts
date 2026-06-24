import * as fs from 'fs';
import * as path from 'path';
import { DB } from '../store/db';
import { ActionItemRow, getLatestDraft } from '../store/actions';
import { getChat } from '../store/messages';

/**
 * Optional Obsidian export. When OBSIDIAN_VAULT_PATH is set, each new action item is
 * appended to a dated daily note inside a "Narayan" subfolder of the vault. Disabled
 * (no-op) when the path is null.
 */
export class ObsidianExporter {
  constructor(
    private db: DB,
    private vaultPath: string | null,
  ) {}

  get enabled(): boolean {
    return Boolean(this.vaultPath);
  }

  private dailyNotePath(date: Date): string {
    const folder = path.join(this.vaultPath!, 'Narayan');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    const stamp = date.toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(folder, `${stamp}.md`);
  }

  appendActionItem(item: ActionItemRow): void {
    if (!this.enabled) return;
    const chat = getChat(this.db, item.chat_id);
    const draft = getLatestDraft(this.db, item.id);
    const file = this.dailyNotePath(new Date(item.created_at * 1000));

    if (!fs.existsSync(file)) {
      const title = new Date(item.created_at * 1000).toISOString().slice(0, 10);
      fs.writeFileSync(file, `# Narayan — ${title}\n\n## Requests\n\n`);
    }

    const due = item.due_at
      ? ` (due ${new Date(item.due_at * 1000).toLocaleString('en-IN')})`
      : '';
    const lines = [
      `- [ ] **${item.summary}**${due}`,
      `    - chat: ${chat?.name ?? 'unknown'} · priority: ${item.priority}` +
        (item.requested_by ? ` · from: ${item.requested_by}` : ''),
    ];
    if (draft) lines.push(`    - draft: ${draft.draft_text.replace(/\n/g, ' ')}`);
    lines.push('');

    fs.appendFileSync(file, lines.join('\n') + '\n');
  }
}
