import { Telegraf, Markup } from 'telegraf';
import { DB } from '../store/db';
import { Env } from '../config';
import {
  ActionItemRow,
  getAction,
  getLatestDraft,
  getOpenItems,
  getItemsDueBetween,
  setStatus,
  markNotified,
  approveDraft,
  snooze,
} from '../store/actions';
import { formatActionItem, formatDigest } from './format';
import { dayBoundsSec } from '../util/time';

/**
 * Narayan's Telegram control surface. Only the configured owner chat may interact.
 * In Phase 1 "Approve" marks the draft approved and the item done (no WhatsApp send);
 * the owner copies the reply text. Phase 2 will wire approval to an outbound send.
 */
export class TelegramNotifier {
  private bot: Telegraf;
  private ownerChatId: string;

  constructor(
    private db: DB,
    private env: Env,
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
        Markup.button.callback('⏰ Snooze 2h', `snooze:${id}`),
      ],
      [
        Markup.button.callback('✔️ Done', `done:${id}`),
        Markup.button.callback('🗑 Dismiss', `dismiss:${id}`),
      ],
    ]);
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
      // Send each as its own actionable card (cap to avoid flooding).
      for (const item of items.slice(0, 15)) {
        this.sendActionCard(item).catch((e) => console.error('[telegram] send error', e));
      }
    });

    this.bot.command('today', (ctx) => {
      if (!this.isOwner(ctx)) return;
      const { start, end } = dayBoundsSec(new Date());
      const items = getItemsDueBetween(this.db, start, end);
      ctx.replyWithHTML(formatDigest(this.db, items, "Today's items"));
    });

    this.bot.command('digest', (ctx) => {
      if (!this.isOwner(ctx)) return;
      const items = getOpenItems(this.db);
      ctx.replyWithHTML(formatDigest(this.db, items, 'All open items'));
    });

    this.bot.action(/approve:(\d+)/, (ctx) => this.handleApprove(ctx));
    this.bot.action(/snooze:(\d+)/, (ctx) => this.handleSnooze(ctx));
    this.bot.action(/done:(\d+)/, (ctx) => this.handleStatus(ctx, 'done', '✔️ Marked done'));
    this.bot.action(/dismiss:(\d+)/, (ctx) =>
      this.handleStatus(ctx, 'dismissed', '🗑 Dismissed'),
    );
  }

  private async handleApprove(ctx: any): Promise<void> {
    if (!this.isOwner(ctx)) return;
    const id = Number(ctx.match[1]);
    approveDraft(this.db, id);
    setStatus(this.db, id, 'done');
    const draft = getLatestDraft(this.db, id);
    await ctx.answerCbQuery('Approved');
    await ctx.editMessageReplyMarkup(undefined);
    if (draft) {
      await ctx.reply(
        '✅ Approved. Copy & send this on WhatsApp:\n\n' + draft.draft_text,
      );
    }
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

  /** Push a single actionable card for an item, with buttons. */
  async sendActionCard(item: ActionItemRow): Promise<void> {
    const fresh = getAction(this.db, item.id) ?? item;
    await this.bot.telegram.sendMessage(
      this.ownerChatId,
      formatActionItem(this.db, fresh),
      { parse_mode: 'HTML', ...this.actionKeyboard(fresh.id) },
    );
    markNotified(this.db, fresh.id);
  }

  /** Push a plain HTML message (used for digests). */
  async sendMessage(html: string): Promise<void> {
    await this.bot.telegram.sendMessage(this.ownerChatId, html, { parse_mode: 'HTML' });
  }

  async launch(): Promise<void> {
    // Telegraf's launch() resolves only when the bot stops; start it detached.
    this.bot.launch().catch((e) => console.error('[telegram] launch error', e));
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    console.log('[telegram] bot launched.');
  }
}
