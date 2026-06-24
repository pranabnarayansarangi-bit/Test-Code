import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';
import { loadEnv, loadConfig } from './config';
import { getDb } from './store/db';
import { markNotified } from './store/actions';
import { connectWhatsApp } from './whatsapp/client';
import { attachIngest } from './whatsapp/ingest';
import { analyzePending } from './analyze/extractor';
import { TelegramNotifier } from './notify/telegram';
import { startScheduler } from './notify/reminders';
import { ObsidianExporter } from './obsidian/vault';

/**
 * Narayan entrypoint.
 *
 *   WhatsApp (Baileys) -> SQLite -> triage (Sonnet) -> draft (Opus) -> Telegram
 *
 * Read/draft-only: nothing is sent back to WhatsApp automatically.
 * Routing: P1 (or anything flagged for review) is pushed instantly; P2 waits for the
 * digest; P3 is archived and only logged to Obsidian.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadConfig(env.configPath);
  const db = getDb(env.dbPath);

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const notifier = new TelegramNotifier(db, env, config);
  const obsidian = new ObsidianExporter(db, env.obsidianVaultPath);

  await notifier.launch();
  startScheduler(db, env, config, notifier, anthropic);

  const { ready } = await connectWhatsApp(env.authDir, (sock) => {
    attachIngest(sock, db, config);
  });
  await ready;

  // Tell the owner we're up — this also confirms Telegram is wired correctly.
  const monitoredCount = config.monitorAllChats
    ? 0
    : config.monitoredChats.length;
  await notifier.notifyOnline(monitoredCount);

  if (obsidian.enabled) {
    console.log(`[obsidian] export enabled -> ${env.obsidianVaultPath}`);
  }

  // Analysis loop: every minute, triage new messages, draft the ones that matter, route.
  const runAnalysis = async () => {
    try {
      const { routed } = await analyzePending(db, env, config, anthropic);
      for (const { item, push } of routed) {
        obsidian.appendActionItem(item);
        if (push) {
          await notifier.sendActionCard(item); // P1 / needs-review → alert now
        } else {
          markNotified(db, item.id); // P2 → digest only (don't instant-push)
        }
      }
    } catch (err) {
      console.error('[analysis loop] error:', err);
    }
  };

  cron.schedule('* * * * *', runAnalysis);
  setTimeout(runAnalysis, 5000); // kick once shortly after startup

  console.log('[narayan] running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('[narayan] fatal:', err);
  process.exit(1);
});
