import { Telegraf, Markup } from 'telegraf';
import { DB } from '../store/db';
import { Env, NarayanConfig } from '../config';
import {
  ActionItemRow,
  getAction,
  getLatestDraft,
  getOpenItems,
  getItemsDueBetween,
  setStatus,
  markNotified,
  approveDraft,
  recordDecision,
  snooze,
} from '../store/actions';
import { formatActionItem, formatDigest } from './format';
import { dayBoundsSec } from '../util/time';

/**
 * Narayan's Telegram control surface. Only the configured owner chat may interact.
 * Read/draft-only: "Approve" records the decision and hands back the reply text to send
 * on WhatsApp (no auto-send in this phase). "Edit" captures the owner's own wording so
 * Narayan learns his voice over time (decision memory).
 */
export class TelegramNotifier {
  private bot: Telegraf;
  private ownerChatId: string;
  /** Action id the owner is currently editing a reply for (keyed by chat id). */
  private pendingEdit = new Map<string, number>();

  constructor(
    private db: DB,
    private env: Env,
    private config: NarayanConfig,
  ) {
    this.bot = new Telegraf(env.telegramBotToken);
    this.ownerChatId = env.telegramChatId;
    this.registerHandlers();
  }

  private isOwner(ctx: { chat?: { id: number } }): boolean {
    return String(ctx.chat?.id) === this.ownerChatId;
  }

  private actionKeyboard(id: number) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Approve', `approve:${id}`),
        Markup.button.callback('✏️ Edit', `edit:${id}`),
      ],
      [
        Markup.button.callback('⏰ Snooze 2h', `snooze:${id}`),
        Markup.button.callback('🗑 Dismiss', `dismiss:${id}`),
      ],
    ]);
  }

  /** Original WhatsApp message body behind an action item (for decision memory). */
  private originalMessage(item: ActionItemRow): string | null {
    if (!item.message_id) return null;
    const row = this.db
      .prepare('SELECT body FROM messages WHERE id = ?')
      .get(item.message_id) as { body: string | null } | undefined;
    return row?.body ?? null;
  }

  private registerHandlers(): void {
    this.bot.start((ctx) => {
      if (!this.isOwner(ctx)) return;
      ctx.reply(
        'Narayan is online. I will surface WhatsApp requests here.\n\n' +
          'Commands: /pending · /today · /digest',
      );
    });

    this.bot.command('pending', (ctx) => {
      if (!this.isOwner(ctx)) return;
      const items = getOpenItems(this.db);
      if (items.length === 0) {
        ctx.reply('Nothing pending. ✅');
        return;
      }
      for (const item of items.slice(0, 15)) {
        this.sendActionCard(item).catch((e) => console.error('[telegram] send error', e));
      }
    });

    this.bot.command('today', (ctx) => {
      if (!this.isOwner(ctx)) return;
      const { start, end } = dayBoundsSec(new Date());
      const items = getItemsDueBetween(this.db, start, end);
      ctx.replyWithHTML(formatDigest(this.db, items, "Today's items", this.config));
    });

    this.bot.command('digest', (ctx) => {
      if (!this.isOwner(ctx)) return;
      const items = getOpenItems(this.db);
      ctx.replyWithHTML(formatDigest(this.db, items, 'All open items', this.config));
    });

    this.bot.action(/approve:(\d+)/, (ctx) => this.handleApprove(ctx));
    this.bot.action(/edit:(\d+)/, (ctx) => this.handleEdit(ctx));
    this.bot.action(/snooze:(\d+)/, (ctx) => this.handleSnooze(ctx));
    this.bot.action(/dismiss:(\d+)/, (ctx) =>
      this.handleStatus(ctx, 'dismissed', '🗑 Dismissed'),
    );

    // Plain text: if the owner is mid-edit, capture it as the final reply.
    this.bot.on('text', (ctx, next) => {
      if (!this.isOwner(ctx)) return;
      const chatKey = String(ctx.chat?.id);
      const actionId = this.pendingEdit.get(chatKey);
      if (actionId === undefined) return next();
      this.pendingEdit.delete(chatKey);
      this.captureDecision(actionId, ctx.message.text, true);
      ctx.reply('✅ Saved your version. Copy & send it on WhatsApp:\n\n' + ctx.message.text);
    });
  }

  /** Approve the model's draft as-is. */
  private async handleApprove(ctx: any): Promise<void> {
    if (!this.isOwner(ctx)) return;
    const id = Number(ctx.match[1]);
    const draft = getLatestDraft(this.db, id);
    this.captureDecision(id, draft?.draft_text ?? '', false);
    await ctx.answerCbQuery('Approved');
    await ctx.editMessageReplyMarkup(undefined);
    if (draft) {
      await ctx.reply('✅ Approved. Copy & send this on WhatsApp:\n\n' + draft.draft_text);
    }
  }

  /** Owner wants to write their own reply — capture the next text message as final. */
  private async handleEdit(ctx: any): Promise<void> {
    if (!this.isOwner(ctx)) return;
    const id = Number(ctx.match[1]);
    this.pendingEdit.set(String(ctx.chat?.id), id);
    await ctx.answerCbQuery('Send your version');
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('✏️ Reply to this chat with your version and I will save it as the sent reply.');
  }

  private async handleSnooze(ctx: any): Promise<void> {
    if (!this.isOwner(ctx)) return;
    const id = Number(ctx.match[1]);
    snooze(this.db, id, Math.floor(Date.now() / 1000) + 2 * 3600);
    await ctx.answerCbQuery('Snoozed 2h');
    await ctx.editMessageReplyMarkup(undefined);
  }

  private async handleStatus(ctx: any, status: 'done' | 'dismissed', msg: string): Promise<void> {
    if (!this.isOwner(ctx)) return;
    const id = Number(ctx.match[1]);
    setStatus(this.db, id, status);
    await ctx.answerCbQuery(msg);
    await ctx.editMessageReplyMarkup(undefined);
  }

  /** Persist the approved/edited reply to decision memory and close the item. */
  private captureDecision(actionId: number, finalText: string, edited: boolean): void {
    const item = getAction(this.db, actionId);
    const draft = getLatestDraft(this.db, actionId);
    approveDraft(this.db, actionId);
    setStatus(this.db, actionId, 'done');
    recordDecision(this.db, {
      actionId,
      originalMessage: item ? this.originalMessage(item) : null,
      draftText: draft?.draft_text ?? null,
      finalText,
      edited,
    });
  }

  /** Push a single actionable card for an item, with buttons. */
  async sendActionCard(item: ActionItemRow): Promise<void> {
    const fresh = getAction(this.db, item.id) ?? item;
    await this.bot.telegram.sendMessage(
      this.ownerChatId,
      formatActionItem(this.db, fresh, this.config),
      { parse_mode: 'HTML', ...this.actionKeyboard(fresh.id) },
    );
    markNotified(this.db, fresh.id);
  }

  /** Push a plain HTML message (used for digests and the daily brief). */
  async sendMessage(html: string): Promise<void> {
    await this.bot.telegram.sendMessage(this.ownerChatId, html, { parse_mode: 'HTML' });
  }

  async launch(): Promise<void> {
    this.bot.launch().catch((e) => console.error('[telegram] launch error', e));
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    console.log('[telegram] bot launched.');
  }
}
