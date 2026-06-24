import Anthropic from '@anthropic-ai/sdk';
import { DB } from '../store/db';
import { Env, NarayanConfig } from '../config';
import { getUnanalyzedMessages, markAnalyzed, getChat, MessageRow } from '../store/messages';
import {
  createActionItem,
  attachDraft,
  getRecentDecisions,
  Priority,
  ActionItemRow,
  getAction,
} from '../store/actions';
import {
  buildTriagePrompt,
  buildTriageUserPrompt,
  buildDraftPrompt,
  buildDraftUserPrompt,
  BatchMessage,
} from './prompts';
import { parseDueHint } from './dueDate';
import { loadKnowledge, knowledgeBlock } from './knowledge';

interface TriagedItem {
  message_index: number;
  summary: string;
  requested_by?: string;
  suggested_owner?: string | null;
  priority?: string;
  due_hint?: string | null;
  awaiting_decision?: boolean;
  is_risk?: boolean;
  confidence?: number;
}

/** A created action item plus how the entrypoint should route it. */
export interface RoutedItem {
  item: ActionItemRow;
  push: boolean; // alert immediately on Telegram
  needsReview: boolean;
}

export interface AnalysisResult {
  routed: RoutedItem[];
}

/** Call Claude for a single text completion at a given effort. Returns '' on failure. */
async function complete(
  client: Anthropic,
  opts: { model: string; effort: string; system: string; user: string; maxTokens: number },
): Promise<string> {
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    thinking: { type: 'adaptive' },
    output_config: { effort: opts.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
    messages: [{ role: 'user', content: opts.user }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Two-stage analysis:
 *  1. Triage (cheap model) — classify + extract structured fields for new messages.
 *  2. Draft (capable model) — write a reply for each non-archived item, learning the
 *     owner's voice from recent approved decisions.
 */
export async function analyzePending(
  db: DB,
  env: Env,
  config: NarayanConfig,
  client: Anthropic,
): Promise<AnalysisResult> {
  const messages = getUnanalyzedMessages(db, 40);
  if (messages.length === 0) return { routed: [] };

  const knowledge = knowledgeBlock(loadKnowledge(env.knowledgePath));

  // ---- Stage 1: triage ----
  const indexed: BatchMessage[] = [];
  const indexToMessage = new Map<number, MessageRow>();
  messages.forEach((m, i) => {
    const chat = getChat(db, m.chat_id);
    indexed.push({
      index: i,
      chatName: chat?.name ?? 'Unknown chat',
      sender: m.sender ?? 'Unknown',
      timestamp: new Date(m.ts * 1000).toISOString(),
      body: m.body ?? '',
    });
    indexToMessage.set(i, m);
  });

  let items: TriagedItem[] = [];
  try {
    const text = await complete(client, {
      model: env.classifyModel,
      effort: env.classifyEffort,
      system: buildTriagePrompt(config, knowledge),
      user: buildTriageUserPrompt(indexed),
      maxTokens: 3000,
    });
    items = parseItems(text);
  } catch (err) {
    console.error('[triage] failed; leaving messages for retry:', err);
    return { routed: [] }; // don't mark analyzed — retry next cycle
  }

  const recentDecisions = getRecentDecisions(db, 8);
  const routed: RoutedItem[] = [];

  for (const it of items) {
    const src = indexToMessage.get(it.message_index);
    if (!src) continue;

    const priority = normalizePriority(it.priority, it.summary, config);
    const confidence = clamp01(it.confidence ?? 1);
    const needsReview = confidence < config.reviewThreshold;
    // P3 is archived only when we're confident; low-confidence items are never auto-hidden.
    const archived = priority === 'P3' && !needsReview;
    const dueAt = parseDueHint(it.due_hint ?? null, config.timezone);

    const actionId = createActionItem(db, {
      chatId: src.chat_id,
      messageId: src.id,
      summary: it.summary,
      requestedBy: it.requested_by,
      suggestedOwner: it.suggested_owner ?? undefined,
      dueAt,
      priority,
      awaitingDecision: Boolean(it.awaiting_decision),
      isRisk: Boolean(it.is_risk),
      confidence,
      status: archived ? 'archived' : 'open',
    });

    // ---- Stage 2: draft (only for items the owner will actually see) ----
    if (!archived) {
      try {
        const chat = getChat(db, src.chat_id);
        const draft = await complete(client, {
          model: env.draftModel,
          effort: env.draftEffort,
          system: buildDraftPrompt(config, knowledge, recentDecisions),
          user: buildDraftUserPrompt({
            summary: it.summary,
            requestedBy: it.requested_by,
            suggestedOwner: it.suggested_owner,
            chatName: chat?.name ?? 'chat',
            originalMessage: src.body,
          }),
          maxTokens: 4000,
        });
        if (draft.trim()) attachDraft(db, actionId, draft.trim(), env.draftModel);
      } catch (err) {
        console.error('[draft] failed for action', actionId, err);
      }
    }

    const item = getAction(db, actionId);
    if (!item) continue;
    routed.push({
      item,
      // Alert immediately for P1, or anything flagged for review. P2 waits for the digest.
      push: !archived && (priority === 'P1' || needsReview),
      needsReview,
    });
  }

  markAnalyzed(
    db,
    messages.map((m) => m.id),
  );
  return { routed };
}

function parseItems(text: string): TriagedItem[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    console.warn('[triage] could not parse model JSON:', text.slice(0, 200));
    return [];
  }
}

function normalizePriority(p: string | undefined, summary: string, config: NarayanConfig): Priority {
  const lower = summary.toLowerCase();
  // Hard override: P1 keyword hits force P1 regardless of the model's call.
  if (config.priorityBands.p1.some((k) => lower.includes(k.toLowerCase()))) return 'P1';
  if (p === 'P1' || p === 'P2' || p === 'P3') return p;
  return 'P2';
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
