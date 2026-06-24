import Anthropic from '@anthropic-ai/sdk';
import { DB } from '../store/db';
import { Env, NarayanConfig } from '../config';
import {
  getUnanalyzedMessages,
  markAnalyzed,
  getChat,
  MessageRow,
} from '../store/messages';
import { createActionItem, Priority } from '../store/actions';
import { buildSystemPrompt, buildUserPrompt, BatchMessage } from './prompts';
import { parseDueHint } from './dueDate';

export interface ExtractedItem {
  message_index: number;
  summary: string;
  requested_by?: string;
  priority?: Priority;
  due_hint?: string | null;
  draft_reply?: string;
}

export interface AnalysisResult {
  newActionIds: number[];
}

/**
 * Pull unanalyzed messages, ask Claude to extract action items, and persist them.
 * Returns the ids of newly created action items (so callers can notify on them).
 */
export async function analyzePending(
  db: DB,
  env: Env,
  config: NarayanConfig,
  client: Anthropic,
): Promise<AnalysisResult> {
  const messages = getUnanalyzedMessages(db, 40);
  if (messages.length === 0) return { newActionIds: [] };

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

  let items: ExtractedItem[] = [];
  try {
    const response = await client.messages.create({
      model: env.model,
      max_tokens: 2000,
      system: buildSystemPrompt(config),
      messages: [{ role: 'user', content: buildUserPrompt(indexed) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    items = parseItems(text);
  } catch (err) {
    console.error('[analyze] Claude call failed; leaving messages for retry:', err);
    return { newActionIds: [] }; // don't mark analyzed — retry next cycle
  }

  const newActionIds: number[] = [];
  for (const item of items) {
    const src = indexToMessage.get(item.message_index);
    if (!src) continue;
    const dueAt = parseDueHint(item.due_hint ?? null, config.timezone);
    const id = createActionItem(db, {
      chatId: src.chat_id,
      messageId: src.id,
      summary: item.summary,
      requestedBy: item.requested_by,
      dueAt,
      priority: normalizePriority(item.priority, item.summary, config),
      draftText: item.draft_reply,
      model: env.model,
    });
    newActionIds.push(id);
  }

  markAnalyzed(
    db,
    messages.map((m) => m.id),
  );
  return { newActionIds };
}

function parseItems(text: string): ExtractedItem[] {
  // Be tolerant of code fences or stray prose around the JSON.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    console.warn('[analyze] could not parse model JSON:', text.slice(0, 200));
    return [];
  }
}

function normalizePriority(
  p: Priority | undefined,
  summary: string,
  config: NarayanConfig,
): Priority {
  if (p === 'high' || p === 'low' || p === 'normal') {
    if (p !== 'high') {
      const lower = summary.toLowerCase();
      if (config.highPriorityKeywords.some((k) => lower.includes(k.toLowerCase()))) {
        return 'high';
      }
    }
    return p;
  }
  return 'normal';
}
