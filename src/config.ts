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
    dailyBrief: string; // "HH:MM" — the "NARAYAN DAILY" chief-of-staff brief
  };
  /** Keyword hints that steer triage toward each priority band (case-insensitive). */
  priorityBands: {
    p1: string[]; // instant alert
    p2: string[]; // digest only
    p3: string[]; // auto-archive, never pushed
  };
  /** Teams/people Narayan may suggest as the owner of an action item. */
  delegationTargets: string[];
  /** Below this confidence (0–1) an item is flagged "⚠ Needs Review". */
  reviewThreshold: number;
  monitoredChats: MonitoredChat[];
  /** When true, every chat is monitored and `monitoredChats` is ignored. */
  monitorAllChats: boolean;
}

export interface Env {
  anthropicApiKey: string;
  /** Cheap/fast model for per-batch triage (classification + extraction). */
  classifyModel: string;
  /** Capable model for drafting replies and the daily brief. */
  draftModel: string;
  classifyEffort: string;
  draftEffort: string;
  briefEffort: string;
  telegramBotToken: string;
  telegramChatId: string;
  authDir: string;
  dbPath: string;
  configPath: string;
  obsidianVaultPath: string | null;
  knowledgePath: string | null;
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
    // Tiered models: cheap triage on every batch, capable drafting on the few that matter.
    classifyModel: process.env.CLASSIFY_MODEL?.trim() || 'claude-sonnet-4-6',
    // Opus 4.8 is the draft tier while Fable 5 is unavailable; set DRAFT_MODEL=claude-fable-5 later.
    draftModel: process.env.DRAFT_MODEL?.trim() || 'claude-opus-4-8',
    classifyEffort: process.env.CLASSIFY_EFFORT?.trim() || 'medium',
    draftEffort: process.env.DRAFT_EFFORT?.trim() || 'xhigh',
    briefEffort: process.env.BRIEF_EFFORT?.trim() || 'xhigh',
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    telegramChatId: required('TELEGRAM_CHAT_ID'),
    authDir: process.env.AUTH_DIR?.trim() || './auth_state',
    dbPath: process.env.DB_PATH?.trim() || './data/narayan.db',
    configPath: process.env.CONFIG_PATH?.trim() || './config.json',
    obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH?.trim() || null,
    knowledgePath: process.env.KNOWLEDGE_PATH?.trim() || null,
  };
}

const DEFAULT_CONFIG: NarayanConfig = {
  timezone: 'Asia/Kolkata',
  ownerName: 'Owner',
  persona:
    'You are Narayan, a concise and respectful executive assistant. You help catch and act on requests received over WhatsApp.',
  reminderTimes: { morningDigest: '08:00', eveningDigest: '20:00', dailyBrief: '09:30' },
  priorityBands: {
    p1: ['payment', 'money', 'escalation', 'vedanta', 'safety', 'legal', 'contract', 'diesel', 'po exhaust', 'production stop', 'breakdown', 'urgent', 'immediately', 'approval'],
    p2: ['procurement', 'tool', 'material', 'daily report', 'work plan', 'site coordination'],
    p3: ['good morning', 'quote', 'wishes', 'greeting', 'fyi'],
  },
  delegationTargets: ['Procurement', 'Finance', 'Store', 'Site Coordination', 'Travel/PA', 'HR'],
  reviewThreshold: 0.75,
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
  // Shallow merge, but merge the nested objects so a partial config keeps sane defaults.
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    reminderTimes: { ...DEFAULT_CONFIG.reminderTimes, ...(raw.reminderTimes ?? {}) },
    priorityBands: { ...DEFAULT_CONFIG.priorityBands, ...(raw.priorityBands ?? {}) },
  };
}

/** Decide whether a chat (by display name) should be processed by Narayan. */
export function isMonitored(config: NarayanConfig, chatName: string | undefined): boolean {
  if (config.monitorAllChats) return true;
  if (!chatName) return false;
  const lower = chatName.toLowerCase();
  return config.monitoredChats.some((c) => lower.includes(c.match.toLowerCase()));
}
