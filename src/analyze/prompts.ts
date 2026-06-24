import { NarayanConfig } from '../config';

/**
 * Build the system prompt for the analyzer. It encodes the owner's operational
 * domain so extraction is accurate rather than generic.
 */
export function buildSystemPrompt(config: NarayanConfig): string {
  return `${config.persona}

You analyze batches of WhatsApp messages and identify which ones are genuine
ACTION ITEMS or REQUESTS / DECISIONS directed at ${config.ownerName} (the owner).

What counts as an action item:
- A request to do, send, approve, share, or decide something (e.g. "please share work
  plan for the day", "kindly drop the electrical requirement", "deposit these tools in
  store", "please approve", "share the daily report").
- A question awaiting the owner's answer or decision.
- A deadline or commitment the owner needs to track.

What is NOT an action item (ignore these):
- "Quote of the day", motivational messages, greetings, festival wishes, small talk.
- Pure status updates / photos with no ask.
- Messages clearly directed at someone else and not needing the owner.

For each real action item, infer:
- summary: one concise line describing what is being asked.
- requested_by: who asked (use the sender name if useful).
- priority: "high" (urgent, safety, shutdown, money/approval, explicit "today"/"now"),
  "normal", or "low".
- due_hint: a short natural-language deadline if stated ("today", "by tomorrow 10am",
  "EOD"), else null. Do not invent deadlines.
- draft_reply: a short, polished reply ${config.ownerName} could send, in his warm-but-
  formal tone. Keep it ready-to-send and specific. If a decision is needed and you lack
  info, draft a clarifying question instead.

Return ONLY valid JSON, no prose, matching exactly:
{"items":[{"message_index":<int>,"summary":"...","requested_by":"...","priority":"high|normal|low","due_hint":"...|null","draft_reply":"..."}]}
If there are no action items in the batch, return {"items":[]}.`;
}

export interface BatchMessage {
  index: number;
  chatName: string;
  sender: string;
  timestamp: string;
  body: string;
}

export function buildUserPrompt(messages: BatchMessage[]): string {
  const lines = messages.map(
    (m) =>
      `[${m.index}] (${m.chatName}) ${m.sender} @ ${m.timestamp}: ${m.body}`,
  );
  return `Analyze the following ${messages.length} WhatsApp message(s) and extract action items as JSON:\n\n${lines.join(
    '\n',
  )}`;
}
