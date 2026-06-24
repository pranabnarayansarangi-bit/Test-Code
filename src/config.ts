import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface MonitoredChat {
  /** Case-insensitive substring matched against the WhatsApp chat name. */
  match: string;
  note?: string;
}

export interface NarayanConfig {
  timezone: string;
  ownerName: string;
  persona: string;
  reminderTimes: {
    morningDigest: string; // "HH:MM"
    eveningDigest: string; // "HH:MM"
  };
  highPriorityKeywords: string[];
  monitoredChats: MonitoredChat[];
  /** When true, every chat is monitored and `monitoredChats` is ignored. */
  monitorAllChats: boolean;
}

export interface Env {
  anthropicApiKey: string;
  model: string;
  telegramBotToken: string;
  telegramChatId: string;
  authDir: string;
  dbPath: string;
  configPath: string;
  obsidianVaultPath: string | null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

export function loadEnv(): Env {
  return {
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.NARAYAN_MODEL?.trim() || 'claude-opus-4-8',
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    telegramChatId: required('TELEGRAM_CHAT_ID'),
    authDir: process.env.AUTH_DIR?.trim() || './auth_state',
    dbPath: process.env.DB_PATH?.trim() || './data/narayan.db',
    configPath: process.env.CONFIG_PATH?.trim() || './config.json',
    obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH?.trim() || null,
  };
}

const DEFAULT_CONFIG: NarayanConfig = {
  timezone: 'Asia/Kolkata',
  ownerName: 'Owner',
  persona:
    'You are Narayan, a concise and respectful executive assistant. You help catch and act on requests received over WhatsApp.',
  reminderTimes: { morningDigest: '08:00', eveningDigest: '20:00' },
  highPriorityKeywords: ['urgent', 'immediately', 'today', 'asap', 'approval'],
  monitoredChats: [],
  monitorAllChats: false,
};

export function loadConfig(configPath: string): NarayanConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    console.warn(
      `[config] ${resolved} not found — using defaults. Copy config.example.json to config.json to customize.`,
    );
    return DEFAULT_CONFIG;
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return { ...DEFAULT_CONFIG, ...raw };
}

/** Decide whether a chat (by display name) should be processed by Narayan. */
export function isMonitored(config: NarayanConfig, chatName: string | undefined): boolean {
  if (config.monitorAllChats) return true;
  if (!chatName) return false;
  const lower = chatName.toLowerCase();
  return config.monitoredChats.some((c) => lower.includes(c.match.toLowerCase()));
}
