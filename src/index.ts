import Anthropic from '@anthropic-ai/sdk';
import cron from 'node-cron';
import { loadEnv, loadConfig } from './config';
import { getDb } from './store/db';
import { getAction, getUnnotifiedOpen } from './store/actions';
import { connectWhatsApp } from './whatsapp/client';
import { attachIngest } from './whatsapp/ingest';
import { analyzePending } from './analyze/extractor';
import { TelegramNotifier } from './notify/telegram';
import { startScheduler } from './notify/reminders';
import { ObsidianExporter } from './obsidian/vault';

/**
 * Narayan entrypoint.
 *
 *   WhatsApp (Baileys) -> SQLite -> Claude analysis -> Telegram reminders/drafts
 *
 * Phase 1 is read/draft-only: nothing is sent back to WhatsApp automatically.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const config = loadConfig(env.configPath);
  const db = getDb(env.dbPath);

  const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  const notifier = new TelegramNotifier(db, env);
  const obsidian = new ObsidianExporter(db, env.obsidianVaultPath);

  await notifier.launch();
  startScheduler(db, config, notifier);

  // Connect WhatsApp and start ingesting monitored chats.
  const { ready } = await connectWhatsApp(env.authDir, (sock) => {
    attachIngest(sock, db, config);
  });
  await ready;

  if (obsidian.enabled) {
    console.log(`[obsidian] export enabled -> ${env.obsidianVaultPath}`);
  }

  // Analysis loop: every minute, classify new messages and push fresh action items.
  const runAnalysis = async () => {
    try {
      const { newActionIds } = await analyzePending(db, env, config, anthropic);
      for (const id of newActionIds) {
        const item = getAction(db, id);
        if (!item) continue;
        obsidian.appendActionItem(item);
        await notifier.sendActionCard(item);
      }
      // Safety net: push any open item that somehow wasn't notified yet.
      for (const item of getUnnotifiedOpen(db)) {
        obsidian.appendActionItem(item);
        await notifier.sendActionCard(item);
      }
    } catch (err) {
      console.error('[analysis loop] error:', err);
    }
  };

  cron.schedule('* * * * *', runAnalysis);
  // Kick once shortly after startup so the owner sees activity quickly.
  setTimeout(runAnalysis, 5000);

  console.log('[narayan] running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('[narayan] fatal:', err);
  process.exit(1);
});
