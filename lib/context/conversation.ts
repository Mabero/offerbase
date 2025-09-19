// Utilities to build compact conversation context for retrieval
// Language-agnostic, no niche/product hardcoding.

import { TermExtractor } from '@/lib/search/term-extractor';

export interface ConversationContextOptions {
  lastTurns?: number; // how many prior turns to include
  maxTerms?: number;  // cap on total terms
}

// Extract plain text from AI SDK UIMessage-like objects
export function extractTextFromMessages(messages: any[]): string[] {
  const texts: string[] = [];
  for (const m of messages || []) {
    if (typeof m?.content === 'string') {
      texts.push(m.content);
    } else if (Array.isArray(m?.parts)) {
      const t = m.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join(' ').trim();
      if (t) texts.push(t);
    }
  }
  return texts;
}

// Build a compact list of context terms from the last N turns (user + assistant)
export function buildConversationContext(
  messages: any[],
  opts: ConversationContextOptions = {}
): string[] {
  const lastTurns = opts.lastTurns ?? Number(process.env.CONTEXT_LAST_TURNS ?? 2);
  const maxTerms = opts.maxTerms ?? Number(process.env.CONTEXT_MAX_TERMS ?? 5);

  if (!Array.isArray(messages) || messages.length === 0 || lastTurns <= 0) return [];

  // Take the last N message pairs (user/assistant), excluding the current user query (last message)
  // We walk backwards and collect up to 2*lastTurns messages (user+assistant), skipping the last one.
  const prior = messages.slice(0, -1);
  const collected: any[] = [];
  for (let i = prior.length - 1; i >= 0 && collected.length < lastTurns * 2; i--) {
    collected.push(prior[i]);
  }
  collected.reverse();

  const texts = extractTextFromMessages(collected);
  if (texts.length === 0) return [];

  const extractor = new TermExtractor();
  const allTerms: string[] = [];

  for (const t of texts) {
    const extracted = extractor.extractTerms(t, maxTerms);
    if (extracted) {
      // Prefer combined (bigrams + tokens), keep order significance roughly
      allTerms.push(...extracted.combined);
    }
  }

  // Deduplicate while preserving order, cap to maxTerms
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of allTerms) {
    const key = term.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
    if (unique.length >= maxTerms) break;
  }
  return unique;
}

// Simple heuristic for detecting follow-up queries across European languages
export function isFollowUpQuery(query: string): boolean {
  const q = (query || '').toLowerCase().trim();
  if (!q) return false;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length <= 3) return true; // very short follow-up

  // Pronouns/demonstratives in several European languages (not exhaustive)
  const hints = [
    // English
    'it', 'this', 'that', 'they', 'them', 'those', 'these',
    // Norwegian/Swedish/Danish
    'den', 'det', 'dette', 'denne', 'disse',
    // German
    'es', 'das', 'dies', 'diese',
    // French
    'il', 'elle', 'ça', 'cela', 'ceci', 'ces',
    // Spanish/Portuguese
    'eso', 'esto', 'esa', 'ese', 'isto', 'isso', 'eles', 'elas',
    // Italian
    'esso', 'questa', 'questo', 'quello', 'quelle', 'questi',
    // Dutch
    'het', 'dit', 'dat', 'deze'
  ];
  const set = new Set(hints);
  return tokens.some(t => set.has(t));
}

