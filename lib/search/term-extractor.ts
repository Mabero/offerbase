/**
 * Term Extractor for corpus-aware search
 * Extracts meaningful terms from queries without hardcoded stopwords
 */

export interface ExtractedTerms {
  tokens: string[];
  bigrams: string[];
  combined: string[];
  script: 'latin' | 'non_latin';
}

export class TermExtractor {
  // Unicode scripts that should skip extraction and use trigram fallback
  private readonly SKIP_EXTRACTION_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Arabic}\p{Script=Hebrew}]/u;

  /**
   * Extract meaningful terms from query
   * Returns null if non-Latin script detected (use trigram fallback)
   */
  extractTerms(query: string, maxTerms?: number): ExtractedTerms | null {
    const max = maxTerms || Number(process.env.MAX_EXTRACT_TERMS || 5);
    
    // Skip extraction for non-Latin scripts
    if (this.SKIP_EXTRACTION_SCRIPTS.test(query)) {
      return null; // Signal to use trigram fallback
    }

    // Normalize separators to match normalize_text behavior (g-3 → g3)
    const normalized = query
      .toLowerCase()
      .replace(/([a-z])[\s\-\.]+([\d])/g, '$1$2'); // Only letter→digit

    // Extract tokens using Unicode word boundaries
    const tokens = this.tokenize(normalized);
    
    // Build bigrams from adjacent tokens
    const bigrams = this.buildBigrams(tokens);
    
    // Rank and limit terms
    const combined = this.rankTerms([...bigrams, ...tokens], max);

    return {
      tokens,
      bigrams,
      combined,
      script: 'latin'
    };
  }

  /**
   * Tokenize text into meaningful words using Unicode properties
   */
  private tokenize(text: string): string[] {
    const minLength = Number(process.env.TERM_MIN_LENGTH || 2);
    
    // Split on Unicode word boundaries and filter
    return text
      .split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, '')) // Keep letters and numbers only
      .filter(token => 
        token.length >= minLength && 
        /[\p{L}\p{N}]/u.test(token) // Must contain at least one letter or number
      );
  }

  /**
   * Build bigrams from adjacent tokens
   */
  private buildBigrams(tokens: string[]): string[] {
    if (tokens.length < 2) return [];
    
    const bigrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    
    return bigrams;
  }

  /**
   * Rank terms by significance using mathematical properties
   * Priority: bigrams > has_digits > length
   */
  private rankTerms(terms: string[], max: number): string[] {
    return terms
      .filter(term => term.length >= Number(process.env.TERM_MIN_LENGTH || 2))
      .sort((a, b) => {
        // Priority 1: Bigrams (contain space)
        const aIsBigram = a.includes(' ');
        const bIsBigram = b.includes(' ');
        if (aIsBigram !== bIsBigram) {
          return aIsBigram ? -1 : 1;
        }

        // Priority 2: Contains digits
        const aHasDigit = /\d/.test(a);
        const bHasDigit = /\d/.test(b);
        if (aHasDigit !== bHasDigit) {
          return aHasDigit ? -1 : 1;
        }

        // Priority 3: Length (longer is better)
        return b.length - a.length;
      })
      .slice(0, max);
  }

  /**
   * Check if query contains non-Latin scripts
   */
  isNonLatin(query: string): boolean {
    return this.SKIP_EXTRACTION_SCRIPTS.test(query);
  }
}