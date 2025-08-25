/**
 * Universal Ambiguity Detector
 * Pure heuristic function to detect ambiguous queries across all domains
 * No API calls, completely deterministic
 */

import { normalize_text } from '../context/safe-extract';

export interface AmbiguityResult {
  ambiguous: boolean;
  score: number;        // 0-1 scale
  reasons: string[];
  tokens: string[];     // Actual ambiguous tokens found
}

/**
 * Detect if query contains ambiguous terms that could span multiple categories
 * Uses pure pattern matching - no external dependencies
 */
export function detectAmbiguity(query: string): AmbiguityResult {
  const normalized = normalize_text(query);
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0);
  
  const reasons: string[] = [];
  const ambiguousTokens: string[] = [];
  let score = 0;
  
  for (const token of tokens) {
    let isAmbiguous = false;
    
    // Pattern 1: Short codes (g3, x1, s23)
    if (/^[a-z]?\d{1,3}$/i.test(token)) {
      isAmbiguous = true;
      reasons.push('short_code');
    }
    
    // Pattern 2: Mixed alphanumeric 2-4 chars (g3, x1, s23, h4, etc.)
    if ((/^[a-z]+\d+$/i.test(token) || /^\d+[a-z]+$/i.test(token)) && 
        token.length >= 2 && token.length <= 4) {
      isAmbiguous = true;
      reasons.push('mixed_alphanumeric');
    }
    
    // Pattern 3: Tier words
    const tierWords = [
      'starter', 'basic', 'standard', 'pro', 'premium', 'enterprise',
      'plus', 'max', 'mini', 'lite', 'advanced', 'elite'
    ];
    if (tierWords.includes(token.toLowerCase())) {
      isAmbiguous = true;
      reasons.push('tier_word');
    }
    
    if (isAmbiguous) {
      ambiguousTokens.push(token);
      score += 0.3; // Each ambiguous token adds to score
    }
  }
  
  // Guard: NOT ambiguous if brand + ambiguous token present
  // Look for potential brand words (4+ chars, all letters)
  const hasPotentialBrand = tokens.some(token => 
    token.length >= 4 && 
    /^[a-z]+$/i.test(token) &&
    !['basic', 'standard', 'premium', 'advanced', 'starter', 'enterprise'].includes(token.toLowerCase())
  );
  
  if (hasPotentialBrand && ambiguousTokens.length > 0) {
    return {
      ambiguous: false,
      score: 0,
      reasons: ['brand_present'],
      tokens: []
    };
  }
  
  // Cap score at 1.0
  score = Math.min(1.0, score);
  
  return {
    ambiguous: ambiguousTokens.length > 0,
    score,
    reasons: [...new Set(reasons)], // Dedupe reasons
    tokens: ambiguousTokens
  };
}