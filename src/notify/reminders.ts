import cron from 'node-cron';
import { DB } from '../store/db';
import { NarayanConfig } from '../config';
import { getOpenItems, getItemsDueBetween, popDueReminders } from '../store/actions';
import { TelegramNotifier } from './telegram';
import { formatDigest } from './format';
import { dayBoundsSec, cronFromHHMM } from '../util/time';

/**
 * Schedule recurring digests and a frequent check for due snoozed reminders.
 */
export function startScheduler(
  db: DB,
  config: NarayanConfig,
  notifier: TelegramNotifier,
): void {
  const tzOpt = { timezone: config.timezone };

  // Morning digest: today's due items + everything still open.
  cron.schedule(
    cronFromHHMM(config.reminderTimes.morningDigest),
    async () => {
      const { start, end } = dayBoundsSec(new Date());
      const dueToday = getItemsDueBetween(db, start, end);
      await notifier.sendMessage(formatDigest(db, dueToday, '☀️ Morning digest — due today'));
      const open = getOpenItems(db);
      await notifier.sendMessage(formatDigest(db, open, '📋 All open requests'));
    },
    tzOpt,
  );

  // Evening digest: what is still open.
  cron.schedule(
    cronFromHHMM(config.reminderTimes.eveningDigest),
    async () => {
      const open = getOpenItems(db);
      await notifier.sendMessage(formatDigest(db, open, '🌙 Evening digest — still open'));
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
    `[reminders] scheduled morning ${config.reminderTimes.morningDigest}, evening ${config.reminderTimes.eveningDigest} (${config.timezone}).`,
  );
}
