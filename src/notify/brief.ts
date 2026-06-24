import Anthropic from '@anthropic-ai/sdk';
import { DB } from '../store/db';
import { Env, NarayanConfig } from '../config';
import {
  getOpenByPriority,
  getItemsDueBetween,
  getAwaitingDecision,
  getRisks,
  ActionItemRow,
} from '../store/actions';
import { getChat } from '../store/messages';
import { loadKnowledge, knowledgeBlock } from '../analyze/knowledge';
import { dayBoundsSec } from '../util/time';

function line(db: DB, it: ActionItemRow): string {
  const chat = getChat(db, it.chat_id);
  const owner = it.suggested_owner ? ` → ${it.suggested_owner}` : '';
  return `- ${it.summary} (${chat?.name ?? 'chat'})${owner}`;
}

function dedupe(items: ActionItemRow[]): ActionItemRow[] {
  const seen = new Set<number>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/**
 * Build the "NARAYAN DAILY" chief-of-staff brief. The capable model turns the open items
 * into a crisp executive read with four sections; falls back to a plain templated brief if
 * the model call fails.
 */
export async function buildDailyBrief(
  db: DB,
  env: Env,
  config: NarayanConfig,
  client: Anthropic,
): Promise<string> {
  const { start, end } = dayBoundsSec(new Date());
  const critical = getOpenByPriority(db, 'P1');
  const dueToday = getItemsDueBetween(db, start, end);
  const awaiting = getAwaitingDecision(db);
  const risks = getRisks(db);

  const sections = {
    Critical: dedupe(critical),
    'Due Today': dedupe(dueToday),
    'Awaiting Your Decision': dedupe(awaiting),
    Risks: dedupe(risks),
  };

  const templated = renderTemplate(db, sections);
  if (Object.values(sections).every((s) => s.length === 0)) {
    return '☀️ <b>NARAYAN DAILY</b>\n\nNothing critical, due, awaiting decision, or at risk today. ✅';
  }

  const knowledge = knowledgeBlock(loadKnowledge(env.knowledgePath));
  const facts = Object.entries(sections)
    .map(([name, items]) => `${name}:\n${items.map((it) => line(db, it)).join('\n') || '(none)'}`)
    .join('\n\n');

  try {
    const response = await client.messages.create({
      model: env.draftModel,
      max_tokens: 2000,
      system:
        `${config.persona}\n\nWrite "${config.ownerName}'s" morning executive brief as his chief of staff. ` +
        `Use exactly these four sections in this order: Critical, Due Today, Awaiting Your Decision, Risks. ` +
        `Under each, list the items as short numbered bullets — crisp, decision-oriented, no filler. ` +
        `If a section is empty, write "None". Start with the title line "NARAYAN DAILY". Plain text only, no markdown headers.` +
        knowledge,
      thinking: { type: 'adaptive' },
      output_config: { effort: env.briefEffort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
      messages: [{ role: 'user', content: `Here are today's open items by section:\n\n${facts}` }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (text) return `☀️ <b>NARAYAN DAILY</b>\n\n${escapeHtml(text)}`;
  } catch (err) {
    console.error('[brief] model call failed; using templated brief:', err);
  }
  return templated;
}

function renderTemplate(db: DB, sections: Record<string, ActionItemRow[]>): string {
  const parts = ['☀️ <b>NARAYAN DAILY</b>', ''];
  for (const [name, items] of Object.entries(sections)) {
    parts.push(`<b>${name}:</b>`);
    if (items.length === 0) parts.push('  None');
    else items.forEach((it, i) => parts.push(`  ${i + 1}. ${escapeHtml(stripChat(db, it))}`));
    parts.push('');
  }
  return parts.join('\n');
}

function stripChat(db: DB, it: ActionItemRow): string {
  const chat = getChat(db, it.chat_id);
  const owner = it.suggested_owner ? ` → ${it.suggested_owner}` : '';
  return `${it.summary} (${chat?.name ?? 'chat'})${owner}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
