/**
 * Language-agnostic text normalization for consistent embedding generation
 * Ensures training materials and queries use identical text representation
 * 
 * Based on best practices from ChatGPT and embedding research:
 * 1. Unicode normalization (NFKC)
 * 2. Whitespace normalization  
 * 3. Case normalization (lowercase)
 * 4. Optional punctuation cleanup
 */

export interface TextNormalizationOptions {
  /**
   * Whether to apply Unicode normalization (NFKC)
   * Default: true
   */
  unicodeNormalize?: boolean;
  
  /**
   * Whether to normalize whitespace (trim + collapse)
   * Default: true  
   */
  normalizeWhitespace?: boolean;
  
  /**
   * Whether to convert to lowercase
   * Default: true
   */
  lowercase?: boolean;
  
  /**
   * Whether to strip trailing punctuation for better matching
   * Default: true
   */
  stripTrailingPunctuation?: boolean;
  
  /**
   * Whether to remove diacritics/accents
   * Default: false (preserves Nordic/international characters)
   */
  removeDiacritics?: boolean;
}

/**
 * Text normalizer for consistent embedding generation across languages
 */
export class TextNormalizer {
  private options: Required<TextNormalizationOptions>;
  
  constructor(options: TextNormalizationOptions = {}) {
    this.options = {
      unicodeNormalize: options.unicodeNormalize ?? true,
      normalizeWhitespace: options.normalizeWhitespace ?? true,
      lowercase: options.lowercase ?? true,
      stripTrailingPunctuation: options.stripTrailingPunctuation ?? true,
      removeDiacritics: options.removeDiacritics ?? false,
    };
  }
  
  /**
   * Normalize text for consistent embedding generation
   */
  normalize(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    let normalized = text;
    
    // 1. Unicode normalization (NFKC) - handles special characters consistently
    if (this.options.unicodeNormalize) {
      normalized = normalized.normalize('NFKC');
    }
    
    // 2. Whitespace normalization - trim and collapse multiple spaces
    if (this.options.normalizeWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }
    
    // 3. Strip trailing punctuation that doesn't add semantic meaning
    if (this.options.stripTrailingPunctuation) {
      normalized = normalized.replace(/[?!.:,;]+$/g, '');
    }
    
    // 4. Remove diacritics (optional - preserves international chars by default)
    if (this.options.removeDiacritics) {
      normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    
    // 5. Lowercase normalization (locale-independent)
    if (this.options.lowercase) {
      normalized = normalized.toLowerCase();
    }
    
    return normalized;
  }
  
  /**
   * Generate a short hash of normalized text for debugging
   * Useful for verifying "same input → same output"
   */
  getDebugHash(text: string): string {
    const normalized = this.normalize(text);
    // Simple hash for debugging - not cryptographic
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
  
  /**
   * Get normalization settings as string for logging
   */
  getOptionsString(): string {
    return Object.entries(this.options)
      .filter(([_, value]) => value === true)
      .map(([key]) => key)
      .join('+');
  }
}

/**
 * Default normalizer instance for embedding consistency
 * Configurable via environment variables
 */
export const createEmbeddingNormalizer = (): TextNormalizer => {
  const options: TextNormalizationOptions = {
    unicodeNormalize: process.env.EMBEDDING_UNICODE_NORMALIZE !== 'false',
    normalizeWhitespace: process.env.EMBEDDING_NORMALIZE_WHITESPACE !== 'false',
    lowercase: process.env.EMBEDDING_LOWERCASE !== 'false',
    stripTrailingPunctuation: process.env.EMBEDDING_STRIP_PUNCTUATION !== 'false',
    removeDiacritics: process.env.EMBEDDING_REMOVE_DIACRITICS === 'true',
  };
  
  return new TextNormalizer(options);
};

/**
 * Default normalizer instance
 */
export const defaultEmbeddingNormalizer = createEmbeddingNormalizer();