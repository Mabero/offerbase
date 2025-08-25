/**
 * Safe Context Extraction
 * Extracts context terms from conversation and page WITHOUT mutating queries
 * Implements two-phase approach: extract before search, optionally filter for telemetry
 */

export interface SafeContext {
  terms: string[];
  categoryHint?: string;
  queryRedacted: boolean;
}

/**
 * PII scrub that preserves short product IDs like g3, x1, s23
 */
function scrubPII(text: string): {text: string, redacted: boolean} {
  let redacted = false;
  let scrubbed = text;
  
  // Target ONLY actual PII (not product codes)
  const patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    url: /https?:\/\/[^\s]+/g,
    address: /\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr)/gi
  };
  
  // Apply each pattern
  Object.entries(patterns).forEach(([type, pattern]) => {
    if (pattern.test(scrubbed)) {
      redacted = true;
      scrubbed = scrubbed.replace(pattern, `[${type}]`);
    }
  });
  
  return {text: scrubbed, redacted};
}

/**
 * Normalization function (must match SQL version exactly)
 */
function normalize_text(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    // Nordic transliteration
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'oe')
    .replace(/[å]/g, 'aa')
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    // Collapse separators around digits (g-3 → g3)
    .replace(/([a-z])[\s\-\.]+(\d)/g, '$1$2')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse denylist from environment with safe defaults
 */
function getDenylist(): string[] {
  const envDenylist = process.env.CONTEXT_DENYLIST;
  if (!envDenylist) return [];
  
  return envDenylist
    .split(',')
    .map(term => term.trim().toLowerCase())
    .filter(term => term.length > 0);
}

/**
 * Phase 1: Extract context from conversation and page (before search)
 * This is the main extraction function - called before any search operations
 */
export function extractContext(input: {
  messages: string[];
  page?: { title?: string; description?: string };
}): SafeContext {
  // Get last 2 user turns only
  const recentMessages = input.messages.slice(-2);
  const combined = recentMessages.join(' ') + ' ' + 
    (input.page?.title || '') + ' ' + 
    (input.page?.description || '');
  
  // 1. PII scrub FIRST
  const { text: scrubbed, redacted } = scrubPII(combined);
  
  // 2. Normalize
  const normalized = normalize_text(scrubbed);
  
  // 3. Extract terms
  let terms = normalized.split(/\s+/)
    .filter(term => term.length >= 2 && term.length <= 20);
  
  // 4. Apply denylist
  const DENYLIST = getDenylist();
  terms = terms.filter(term => !DENYLIST.includes(term));
  
  // 5. Dedupe AFTER normalization
  terms = [...new Set(terms)];
  
  // 6. Cap to 5 terms / 120 chars total
  terms = terms.slice(0, 5);
  const totalLength = terms.join(' ').length;
  if (totalLength > 120) {
    // Reduce further if too long
    while (terms.length > 0 && terms.join(' ').length > 120) {
      terms.pop();
    }
  }
  
  // 7. Extract category hint from page context
  let categoryHint: string | undefined;
  if (input.page?.title) {
    const titleNorm = normalize_text(input.page.title);
    // Simple category detection from page title
    if (titleNorm.includes('hair') || titleNorm.includes('beauty')) {
      categoryHint = 'beauty';
    } else if (titleNorm.includes('vacuum') || titleNorm.includes('clean')) {
      categoryHint = 'cleaning';
    } else if (titleNorm.includes('tech') || titleNorm.includes('device')) {
      categoryHint = 'technology';
    }
  }
  
  return {
    terms,
    categoryHint,
    queryRedacted: redacted
  };
}

/**
 * Phase 2: Optional filtering for telemetry (after candidates are known)
 * This does NOT affect scoring - purely for telemetry tracking
 */
export function filterTermsForTelemetry(
  originalTerms: string[], 
  candidates: Array<{title: string; category?: string}>
): string[] {
  if (!candidates.length) return originalTerms;
  
  // Create set of all words from candidate titles for relevance checking
  const candidateWords = new Set<string>();
  candidates.forEach(candidate => {
    const words = normalize_text(candidate.title).split(/\s+/);
    words.forEach(word => {
      if (word.length >= 2) candidateWords.add(word);
    });
  });
  
  // Keep terms that appear in any candidate (shows they were relevant)
  const relevantTerms = originalTerms.filter(term => 
    candidateWords.has(term)
  );
  
  return relevantTerms;
}

// Export normalization function for use elsewhere
export { normalize_text };

// Export for testing
export { scrubPII };