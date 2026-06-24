import { loadEnv, loadConfig } from '../config';
import { getDb } from '../store/db';
import {
  getOpenByPriority,
  getAwaitingDecision,
  getRisks,
  getRecentDecisions,
  ActionItemRow,
} from '../store/actions';
import { getChat } from '../store/messages';

/**
 * `npm run status` — a quick terminal view of what Narayan has captured, straight from
 * SQLite. Lets you see open items (by priority), what's awaiting your decision, current
 * risks, and your recent approved decisions — without opening Telegram.
 */
function fmtDue(due: number | null): string {
  if (!due) return '';
  return ` (due ${new Date(due * 1000).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })})`;
}

function printItems(db: ReturnType<typeof getDb>, title: string, items: ActionItemRow[], threshold: number): void {
  console.log(`\n${title} — ${items.length}`);
  if (items.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const it of items) {
    const chat = getChat(db, it.chat_id);
    const owner = it.suggested_owner ? ` -> ${it.suggested_owner}` : '';
    const review = it.confidence < threshold ? ' [NEEDS REVIEW]' : '';
    console.log(
      `  • [${it.priority}] ${it.summary}${owner}${fmtDue(it.due_at)}  (${chat?.name ?? 'chat'}, conf ${it.confidence.toFixed(
        2,
      )})${review}`,
    );
  }
}

function main(): void {
  const env = loadEnv();
  const config = loadConfig(env.configPath);
  const db = getDb(env.dbPath);

  console.log('=============================================');
  console.log(' NARAYAN — status');
  console.log('=============================================');

  printItems(db, 'P1 — critical (alerts you now)', getOpenByPriority(db, 'P1'), config.reviewThreshold);
  printItems(db, 'P2 — routine (digest)', getOpenByPriority(db, 'P2'), config.reviewThreshold);
  printItems(db, 'Awaiting your decision', getAwaitingDecision(db), config.reviewThreshold);
  printItems(db, 'Risks', getRisks(db), config.reviewThreshold);

  const decisions = getRecentDecisions(db, 5);
  console.log(`\nRecent decisions (style memory) — ${decisions.length}`);
  if (decisions.length === 0) console.log('  (none yet — approve/edit some replies)');
  for (const d of decisions) {
    const tag = d.edited ? 'edited' : 'approved as drafted';
    console.log(`  • [${tag}] ${d.final_text.slice(0, 80)}${d.final_text.length > 80 ? '…' : ''}`);
  }
  console.log('');
}

main();
