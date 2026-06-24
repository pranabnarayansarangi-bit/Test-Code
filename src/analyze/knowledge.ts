import * as fs from 'fs';
import * as path from 'path';

const MAX_CHARS = 8000; // keep the injected context bounded

/**
 * Load the operator's knowledge.md (personnel, projects, disputes, fleet, receivables).
 * Returns '' when no path is configured or the file is missing, so callers can inject it
 * unconditionally. Loaded once and cached for the process lifetime.
 */
let cache: { path: string | null; text: string } | null = null;

export function loadKnowledge(knowledgePath: string | null): string {
  if (cache && cache.path === knowledgePath) return cache.text;
  let text = '';
  if (knowledgePath) {
    const resolved = path.resolve(knowledgePath);
    if (fs.existsSync(resolved)) {
      text = fs.readFileSync(resolved, 'utf8').slice(0, MAX_CHARS);
    } else {
      console.warn(`[knowledge] ${resolved} not found — running without a knowledge base.`);
    }
  }
  cache = { path: knowledgePath, text };
  return text;
}

/** Wrap the knowledge text as a labelled block for a system prompt (empty string if none). */
export function knowledgeBlock(text: string): string {
  if (!text.trim()) return '';
  return `\n\nKNOWLEDGE BASE (background facts about the operation — use to ground owners, amounts, risks, and names; do not quote verbatim):\n${text}`;
}
