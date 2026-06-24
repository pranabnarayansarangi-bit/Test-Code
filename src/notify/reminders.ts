import cron from 'node-cron';
import Anthropic from '@anthropic-ai/sdk';
import { DB } from '../store/db';
import { Env, NarayanConfig } from '../config';
import { getOpenItems, getItemsDueBetween, popDueReminders } from '../store/actions';
import { TelegramNotifier } from './telegram';
import { formatDigest } from './format';
import { buildDailyBrief } from './brief';
import { dayBoundsSec, cronFromHHMM } from '../util/time';

/**
 * Schedule the daily brief, recurring digests, and a frequent check for due snoozed reminders.
 */
export function startScheduler(
  db: DB,
  env: Env,
  config: NarayanConfig,
  notifier: TelegramNotifier,
  client: Anthropic,
): void {
  const tzOpt = { timezone: config.timezone };

  // "NARAYAN DAILY" chief-of-staff brief.
  cron.schedule(
    cronFromHHMM(config.reminderTimes.dailyBrief),
    async () => {
      const brief = await buildDailyBrief(db, env, config, client);
      await notifier.sendMessage(brief);
    },
    tzOpt,
  );

  // Morning digest: today's due items + everything still open.
  cron.schedule(
    cronFromHHMM(config.reminderTimes.morningDigest),
    async () => {
      const { start, end } = dayBoundsSec(new Date());
      const dueToday = getItemsDueBetween(db, start, end);
      await notifier.sendMessage(
        formatDigest(db, dueToday, '☀️ Morning digest — due today', config),
      );
      const open = getOpenItems(db);
      await notifier.sendMessage(formatDigest(db, open, '📋 All open requests', config));
    },
    tzOpt,
  );

  // Evening digest: what is still open.
  cron.schedule(
    cronFromHHMM(config.reminderTimes.eveningDigest),
    async () => {
      const open = getOpenItems(db);
      await notifier.sendMessage(formatDigest(db, open, '🌙 Evening digest — still open', config));
    },
    tzOpt,
  );

  // Every 5 minutes: fire any snoozed reminders that have come due.
  cron.schedule('*/5 * * * *', async () => {
    const due = popDueReminders(db);
    for (const item of due) {
      await notifier.sendActionCard(item).catch((e) =>
        console.error('[reminders] resend failed', e),
      );
    }
  });

  console.log(
    `[reminders] scheduled brief ${config.reminderTimes.dailyBrief}, morning ${config.reminderTimes.morningDigest}, evening ${config.reminderTimes.eveningDigest} (${config.timezone}).`,
  );
}
