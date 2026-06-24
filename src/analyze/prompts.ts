import { NarayanConfig } from '../config';
import { DecisionRow } from '../store/actions';

export interface BatchMessage {
  index: number;
  chatName: string;
  sender: string;
  timestamp: string;
  body: string;
}

/**
 * Stage 1 — TRIAGE system prompt (cheap model). Classifies each message and extracts
 * structured fields, but does NOT draft replies (that's stage 2 on the capable model).
 */
export function buildTriagePrompt(config: NarayanConfig, knowledge: string): string {
  const bands = config.priorityBands;
  return `${config.persona}

You triage batches of WhatsApp messages and identify which are genuine ACTION ITEMS or
REQUESTS / DECISIONS directed at ${config.ownerName} (the owner).

Assign each real action item a PRIORITY BAND:
- "P1" (critical — alert immediately): payment/money, client escalation, Vedanta matters,
  safety, legal, contract deviation, diesel shortage, PO exhaustion, production stoppage,
  equipment breakdown. Hints: ${bands.p1.join(', ')}.
- "P2" (routine — show in the daily digest): procurement requests, tool deposits, material
  planning, daily reports, work plans, site coordination. Hints: ${bands.p2.join(', ')}.
- "P3" (noise — archive, never alert): greetings, festival wishes, good-morning messages,
  motivational quotes, FYI. Hints: ${bands.p3.join(', ')}.

If a message is NOT an action item at all (pure chatter with no ask and not even a P3-style
greeting worth logging), omit it from the output entirely.

For each action item, extract:
- summary: one concise line describing the ask.
- requested_by: who asked.
- suggested_owner: which team/person should action it. Choose from: ${config.delegationTargets.join(', ')} — or name a person if clearly implied. Use null if unclear.
- priority: "P1" | "P2" | "P3".
- due_hint: short natural-language deadline if stated ("today", "by tomorrow 10am", "EOD"), else null. Never invent a deadline.
- awaiting_decision: true if the owner must personally decide/approve something.
- is_risk: true if it signals an operational/financial risk (stock-out, PO/diesel exhaustion, overdue payment, production stoppage).
- confidence: 0.0–1.0, your confidence that the priority/owner/deadline are correct. Be honest; low confidence triggers a human-review flag.

Return ONLY valid JSON, no prose:
{"items":[{"message_index":<int>,"summary":"...","requested_by":"...","suggested_owner":"...|null","priority":"P1|P2|P3","due_hint":"...|null","awaiting_decision":<bool>,"is_risk":<bool>,"confidence":<number>}]}
If there are no action items, return {"items":[]}.${knowledge}`;
}

export function buildTriageUserPrompt(messages: BatchMessage[]): string {
  const lines = messages.map(
    (m) => `[${m.index}] (${m.chatName}) ${m.sender} @ ${m.timestamp}: ${m.body}`,
  );
  return `Triage the following ${messages.length} WhatsApp message(s) and return JSON:\n\n${lines.join(
    '\n',
  )}`;
}

/**
 * Stage 2 — DRAFT system prompt (capable model). Writes one ready-to-send reply in the
 * owner's voice, learning from recent approved decisions.
 */
export function buildDraftPrompt(
  config: NarayanConfig,
  knowledge: string,
  recentDecisions: DecisionRow[],
): string {
  let examples = '';
  const usable = recentDecisions.filter((d) => d.original_message && d.final_text);
  if (usable.length > 0) {
    examples =
      `\n\nHOW ${config.ownerName.toUpperCase()} ACTUALLY REPLIES (mimic this voice, tone, and structure):\n` +
      usable
        .slice(0, 6)
        .map(
          (d, i) =>
            `Example ${i + 1}\nIncoming: ${truncate(d.original_message!, 300)}\n${config.ownerName} sent: ${truncate(
              d.final_text,
              400,
            )}`,
        )
        .join('\n\n');
  }

  return `${config.persona}

Write a single, ready-to-send WhatsApp reply that ${config.ownerName} could send for the
action item below. Match his warm-but-formal tone. Be specific and concise. If a decision is
needed and key facts are missing, draft a short clarifying question instead of guessing.
Output ONLY the reply text — no preamble, no quotes, no commentary.${examples}${knowledge}`;
}

export function buildDraftUserPrompt(item: {
  summary: string;
  requestedBy?: string | null;
  suggestedOwner?: string | null;
  chatName: string;
  originalMessage?: string | null;
}): string {
  const parts = [
    `Group/chat: ${item.chatName}`,
    item.requestedBy ? `Requested by: ${item.requestedBy}` : '',
    item.suggestedOwner ? `Suggested owner: ${item.suggestedOwner}` : '',
    `Ask: ${item.summary}`,
    item.originalMessage ? `Original message: ${item.originalMessage}` : '',
  ].filter(Boolean);
  return `Draft the reply for this action item:\n\n${parts.join('\n')}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
