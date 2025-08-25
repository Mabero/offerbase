/**
 * Text normalization for offers system - MUST match SQL normalize_text() exactly
 * 
 * This function implements the same normalization as the SQL function:
 * 1. Lowercase
 * 2. Transliterate Nordic characters: æ→ae, ø→oe, å→aa, ä→ae, ö→oe  
 * 3. Collapse separators: g-3→g3, g.3→g3, g 3→g3
 * 4. Normalize whitespace: collapse multiple spaces to single space, trim
 * 
 * Used for:
 * - Offer resolution (consistent query normalization)
 * - Chunk post-filtering (brand/model matching)
 * - Auto-alias generation
 */

/**
 * Normalize text for consistent language-agnostic matching
 * KEEP IN SYNC WITH SQL normalize_text() function
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let normalized = text.toLowerCase();
  
  // Transliterations - Nordic and German characters
  // EXACT MATCH with SQL regexp_replace calls
  const transliterations: Record<string, string> = {
    'æ': 'ae',  // Norwegian/Danish
    'ø': 'oe',  // Norwegian/Danish  
    'å': 'aa',  // Norwegian/Danish/Swedish
    'ä': 'ae',  // Swedish/German
    'ö': 'oe'   // Swedish/German
  };
  
  // Apply each transliteration (matches SQL regex replacements)
  Object.entries(transliterations).forEach(([from, to]) => {
    normalized = normalized.replace(new RegExp(from, 'g'), to);
  });
  
  // Separator normalization: ([a-z])[\s\-\.]+(\d) → \1\2
  // Examples: g-3→g3, g.3→g3, g 3→g3, iviskin-g4→ivisking4
  normalized = normalized.replace(/([a-z])[\s\-\.]+(\d)/gi, '$1$2');
  
  // Collapse multiple whitespace to single space (matches SQL \s+ → ' ')
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Trim whitespace (matches SQL trim())
  return normalized.trim();
}

/**
 * Generate debug hash for testing normalization parity
 * Used to verify SQL and TypeScript produce identical results
 */
export function getNormalizationHash(text: string): string {
  const normalized = normalizeText(text);
  // Simple hash for debugging - matches concept from existing text-normalizer.ts
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Test cases for normalization parity verification
 * These should produce identical results in SQL and TypeScript
 */
export const NORMALIZATION_TEST_CASES = [
  // Basic cases
  ['Hello World', 'hello world'],
  ['  Multiple   Spaces  ', 'multiple spaces'],
  
  // Norwegian/Danish
  ['IVISKIN Hårfjerning', 'iviskin haarfjerning'], 
  ['Læs mere om vores produkter', 'laes mere om vores produkter'],
  ['Køb nu på vores hjemmeside', 'koeb nu paa vores hjemmeside'],
  
  // Swedish/German  
  ['Hände waschen ist wichtig', 'haende waschen ist wichtig'],
  ['Skönhet och hälsa', 'skoenhet och haelsa'],
  
  // Separator normalization (key for G3/G4)
  ['IVISKIN G-3', 'iviskin g3'],
  ['IviSkin G.3', 'iviskin g3'], 
  ['iviskin g 3', 'iviskin g3'],
  ['G-4 Laser', 'g4 laser'],
  ['Model X-1', 'model x1'],
  ['Type A.2', 'type a2'],
  
  // Mixed cases with multiple issues
  ['  IVISKIN  G-3  Hårfjerning  ', 'iviskin g3 haarfjerning'],
  ['Köp IVISKIN G.4 idag!', 'koep iviskin g4 idag!'],
  ['Læs   om   G-3   vs   G-4', 'laes om g3 vs g4'],
  
  // Edge cases
  ['', ''],
  ['   ', ''],
  ['123', '123'],
  ['G3', 'g3'], // Should stay as g3
  ['G4', 'g4'], // Should stay as g4
] as const;

/**
 * Validate that a string was properly normalized
 * Used for debugging and testing
 */
export function isNormalized(text: string): boolean {
  return normalizeText(text) === text;
}

/**
 * Extract model numbers from text (helper for debugging)
 * Useful for verifying G3/G4 extraction works correctly
 */
export function extractModelNumbers(text: string): string[] {
  const normalized = normalizeText(text);
  const modelPattern = /[a-z]+\d+/g;
  return normalized.match(modelPattern) || [];
}