/**
 * Context-aware keyword extraction for intelligent product matching
 * Extracts domain-specific keywords from training materials to disambiguate product queries
 */

export interface TrainingChunk {
  content: string;
  materialTitle: string;
}

/**
 * Extract context keywords from training chunks for product matching
 * These keywords help disambiguate queries like "G3" by providing domain context
 */
export function extractContextKeywords(
  chunks: TrainingChunk[], 
  userQuery?: string,
  maxKeywords = 15
): string[] {
  // Combine all chunk content and user query
  const allText = [
    ...chunks.map(c => c.content),
    ...chunks.map(c => c.materialTitle), 
    userQuery || ''
  ].join(' ');

  // Tokenize and clean
  const words = tokenizeText(allText);
  
  // Count word frequency
  const wordFreq = countWordFrequency(words);
  
  // Get most relevant keywords
  const keywords = Object.entries(wordFreq)
    .filter(([word, freq]) => isRelevantKeyword(word, freq))
    .sort(([, a], [, b]) => b - a) // Sort by frequency desc
    .slice(0, maxKeywords)
    .map(([word]) => word);

  console.log('🔍 Extracted context keywords:', keywords);
  
  return keywords;
}

/**
 * Extract keywords from user query for basic context
 * Fallback when no training chunks are available
 */
export function extractQueryKeywords(query: string, maxKeywords = 8): string[] {
  const words = tokenizeText(query);
  const filtered = words.filter(word => isRelevantKeyword(word, 1));
  
  return filtered.slice(0, maxKeywords);
}

/**
 * Tokenize text into clean words
 */
function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sæøåäöü]/g, ' ') // Keep international characters
    .split(/\s+/)
    .filter(word => 
      word.length >= 2 && 
      word.length <= 20 &&
      /[a-zæøåäöü]/.test(word) // Must contain at least one letter
    );
}

/**
 * Count word frequency for relevance scoring
 */
function countWordFrequency(words: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  
  for (const word of words) {
    freq[word] = (freq[word] || 0) + 1;
  }
  
  return freq;
}

/**
 * Determine if a word is relevant for product matching context
 * Filters out very common words without hardcoding language-specific stop words
 */
function isRelevantKeyword(word: string, frequency: number): boolean {
  // Skip very short words
  if (word.length < 2) return false;
  
  // Skip very long words (likely URLs, codes, etc.)  
  if (word.length > 20) return false;
  
  // Skip pure numbers unless short (model numbers like G3, G4)
  if (/^\d+$/.test(word) && word.length > 3) return false;
  
  // Skip words that are too rare (frequency = 1) or too common
  // This naturally filters stop words without hardcoding languages
  if (frequency < 1 || frequency > 50) return false;
  
  // Keep product-like terms (alphanumeric combinations)
  if (/^[a-zæøåäöü]\d+$|^\d+[a-zæøåäöü]$/.test(word)) return true; // G3, 4K, etc.
  
  // Keep technical/domain terms (typically compound or specialized words)
  if (word.length >= 4) return true;
  
  // For short words (2-3 chars), be more selective
  if (word.length <= 3) {
    // Keep if it's likely a model number or brand code
    return /\d/.test(word) || /[gqx]/.test(word); // G3, Q2, X1, etc.
  }
  
  return true;
}

/**
 * Check if product title/aliases contain any context keywords
 * Used for guarding short alias matches
 */
export function hasContextKeyword(
  productText: string, 
  contextKeywords: string[]
): boolean {
  if (!contextKeywords.length) return true; // No context available, allow match
  
  const normalizedText = productText.toLowerCase();
  
  return contextKeywords.some(keyword => 
    normalizedText.includes(keyword.toLowerCase())
  );
}

/**
 * Normalize text for matching (used in database functions)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\sæøåäöü]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Test function to verify keyword extraction works correctly
 */
export function testKeywordExtraction() {
  const testChunks: TrainingChunk[] = [
    {
      content: "IVISKIN G3 er en IPL hårfjerning enhet som bruker laser teknologi for permanent hårfjerning på huden",
      materialTitle: "IPL Hårfjerning Guide"
    },
    {
      content: "Laser hårfjerning med IPL teknologi er effektiv for mørke hår på lys hud. G4 modellen har mer kraft",  
      materialTitle: "Laser Guide"
    }
  ];
  
  const keywords = extractContextKeywords(testChunks, "er iviskin g3 bra?");
  
  console.log('🧪 Test extraction result:', keywords);
  console.log('Expected keywords like: ipl, hårfjerning, laser, iviskin, g3, g4');
  
  return keywords;
}