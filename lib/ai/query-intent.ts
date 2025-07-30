export type QueryIntent = 'comparison' | 'best_choice' | 'specific_product' | 'pricing' | 'features' | 'general' | 'how_to';

export interface QueryAnalysis {
  intent: QueryIntent;
  keywords: string[];
  products: string[];
  confidence: number;
  isComparative: boolean;
  isLookingForRecommendation: boolean;
  contextBoosts: {
    ranking: number;
    comparison: number;
    product_page: number;
    review: number;
    service: number;
    tutorial: number;
    general: number;
  };
}

/**
 * Analyze user query to understand intent and extract relevant information
 */
export function analyzeQueryIntent(query: string, conversationHistory: Array<{ role: string; content: string }> = []): QueryAnalysis {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\W+/).filter(w => w.length > 2);
  
  // Detect query intent
  const intent = detectQueryIntent(queryLower, words);
  
  // Extract keywords and products
  const keywords = extractQueryKeywords(queryLower, intent);
  const products = extractMentionedProductsFromQuery(query);
  
  // Determine if query is comparative or recommendation-seeking
  const isComparative = detectComparativeLanguage(queryLower);
  const isLookingForRecommendation = detectRecommendationSeeking(queryLower);
  
  // Calculate content type boosts for context selection
  const contextBoosts = calculateContentTypeBoosts(intent, isComparative, isLookingForRecommendation);
  
  // Calculate confidence score
  const confidence = calculateIntentConfidence(query, intent, keywords);

  return {
    intent,
    keywords,
    products,
    confidence,
    isComparative,
    isLookingForRecommendation,
    contextBoosts
  };
}

/**
 * Detect the primary intent of the user query
 */
function detectQueryIntent(queryLower: string, words: string[]): QueryIntent {
  // Intent patterns with keywords
  const intentPatterns: Record<QueryIntent, string[]> = {
    comparison: ['vs', 'versus', 'compare', 'comparison', 'difference', 'better', 'which'],
    best_choice: ['best', 'top', 'recommend', 'suggestion', 'choice', 'winner', 'favorite'],
    specific_product: [], // Will be detected by product name presence
    pricing: ['price', 'cost', 'expensive', 'cheap', 'affordable', 'budget', 'money'],
    features: ['features', 'specs', 'specifications', 'capabilities', 'function', 'what'],
    how_to: ['how', 'setup', 'install', 'configure', 'use', 'tutorial', 'guide'],
    general: [] // Default fallback
  };

  // Score each intent
  const scores: Record<QueryIntent, number> = {
    comparison: 0,
    best_choice: 0,
    specific_product: 0,
    pricing: 0,
    features: 0,
    how_to: 0,
    general: 0
  };

  // Calculate scores based on keyword matches
  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    for (const pattern of patterns) {
      if (queryLower.includes(pattern)) {
        scores[intent as QueryIntent] += 1;
        // Boost score for exact word matches
        if (words.includes(pattern)) {
          scores[intent as QueryIntent] += 0.5;
        }
      }
    }
  }

  // Special handling for specific patterns
  if (/which\s+is\s+(?:the\s+)?best/i.test(queryLower)) {
    scores.best_choice += 2;
  }
  
  if (/\bhow\s+much/i.test(queryLower)) {
    scores.pricing += 2;
  }
  
  if (/what\s+(?:does|is|are)/i.test(queryLower)) {
    scores.features += 1;
  }

  // Return intent with highest score
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'general';
  
  return Object.entries(scores).reduce((a, b) => scores[a[0] as QueryIntent] > scores[b[0] as QueryIntent] ? a : b)[0] as QueryIntent;
}

/**
 * Extract relevant keywords based on query intent
 */
function extractQueryKeywords(queryLower: string, intent: QueryIntent): string[] {
  const words = queryLower.split(/\W+/).filter(w => w.length > 2);
  
  // Common stop words to filter out
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
    'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
    'what', 'where', 'when', 'how', 'why', 'who', 'can', 'could',
    'would', 'should', 'will', 'are', 'was', 'were', 'been', 'have', 'has'
  ]);

  // Intent-specific important keywords
  const intentKeywords: Record<QueryIntent, string[]> = {
    comparison: ['vs', 'versus', 'compare', 'better', 'difference'],
    best_choice: ['best', 'top', 'recommend', 'choice', 'winner'],
    specific_product: [],
    pricing: ['price', 'cost', 'expensive', 'cheap', 'budget'],
    features: ['features', 'specs', 'capabilities', 'function'],
    how_to: ['how', 'setup', 'install', 'use', 'tutorial'],
    general: []
  };

  // Extract relevant words
  const keywords = words.filter(word => !stopWords.has(word));
  
  // Add intent-specific keywords that appear in query
  const specificKeywords = intentKeywords[intent].filter(keyword => 
    queryLower.includes(keyword)
  );

  return [...new Set([...keywords, ...specificKeywords])].slice(0, 10);
}

/**
 * Extract product names mentioned in the query
 */
function extractMentionedProductsFromQuery(query: string): string[] {
  const products: string[] = [];
  
  // Look for capitalized words that might be product names
  const capitalizedWords = query.match(/\b[A-Z][a-zA-Z0-9\s]{2,30}\b/g) || [];
  
  // Filter out common non-product words
  const nonProductWords = new Set([
    'The', 'This', 'That', 'What', 'Which', 'Where', 'When', 'How', 'Why',
    'Can', 'Could', 'Would', 'Should', 'Will', 'Are', 'Was', 'Were',
    'I', 'You', 'We', 'They', 'He', 'She', 'It'
  ]);

  const potentialProducts = capitalizedWords.filter(word => 
    !nonProductWords.has(word.trim()) && 
    word.trim().length > 2
  );

  products.push(...potentialProducts.map(p => p.trim()));

  return [...new Set(products)].slice(0, 5);
}

/**
 * Detect if query uses comparative language
 */
function detectComparativeLanguage(queryLower: string): boolean {
  const comparativePatterns = [
    /\bvs\b|\bversus\b/,
    /\bcompare\b|\bcomparison\b/,
    /\bbetter\s+than\b/,
    /\bwhich\s+(?:is\s+)?(?:better|best)\b/,
    /\bdifference\s+between\b/,
    /\bor\b.*\bor\b/, // "X or Y or Z"
    /\b(?:between|among)\b.*\band\b/
  ];

  return comparativePatterns.some(pattern => pattern.test(queryLower));
}

/**
 * Detect if user is seeking recommendations
 */
function detectRecommendationSeeking(queryLower: string): boolean {
  const recommendationPatterns = [
    /\b(?:what|which).*(?:recommend|suggest|advice)\b/,
    /\b(?:what|which).*(?:best|good|better)\b/,
    /\bshould\s+i\b/,
    /\brecommend\b|\bsuggestion\b|\badvice\b/,
    /\bwhat.*(?:choose|pick|select)\b/,
    /\bhelp\s+me\s+(?:choose|pick|decide)\b/
  ];

  return recommendationPatterns.some(pattern => pattern.test(queryLower));
}

/**
 * Calculate boost scores for different content types based on query analysis
 */
function calculateContentTypeBoosts(
  intent: QueryIntent, 
  isComparative: boolean, 
  isLookingForRecommendation: boolean
): QueryAnalysis['contextBoosts'] {
  const boosts = {
    ranking: 1.0,
    comparison: 1.0,
    product_page: 1.0,
    review: 1.0,
    service: 1.0,
    tutorial: 1.0,
    general: 1.0
  };

  // Intent-based boosts
  switch (intent) {
    case 'best_choice':
      boosts.ranking = 2.5;
      boosts.review = 2.0;
      boosts.comparison = 1.8;
      break;
      
    case 'comparison':
      boosts.comparison = 2.5;
      boosts.ranking = 2.0;
      boosts.review = 1.8;
      break;
      
    case 'specific_product':
      boosts.product_page = 2.0;
      boosts.review = 1.5;
      break;
      
    case 'pricing':
      boosts.product_page = 2.0;
      boosts.comparison = 1.5;
      break;
      
    case 'features':
      boosts.product_page = 2.0;
      boosts.review = 1.8;
      break;
      
    case 'how_to':
      boosts.tutorial = 2.5;
      boosts.general = 1.5;
      break;
  }

  // Additional boosts based on language patterns
  if (isComparative) {
    boosts.comparison += 1.0;
    boosts.ranking += 0.8;
  }

  if (isLookingForRecommendation) {
    boosts.ranking += 1.2;
    boosts.review += 1.0;
  }

  return boosts;
}

/**
 * Calculate confidence score for intent detection
 */
function calculateIntentConfidence(query: string, intent: QueryIntent, keywords: string[]): number {
  let confidence = 0.5; // Base confidence

  // Boost for query length (more words = more context)
  const wordCount = query.split(/\s+/).length;
  confidence += Math.min(wordCount / 20, 0.3);

  // Boost for relevant keywords
  confidence += Math.min(keywords.length / 10, 0.2);

  // Intent-specific confidence adjustments
  const strongIntentPatterns = {
    best_choice: /\b(?:what|which)\s+is\s+(?:the\s+)?best\b/i,
    comparison: /\bcompare\b|\bvs\b|\bversus\b/i,
    pricing: /\bhow\s+much\b|\bprice\b|\bcost\b/i,
    how_to: /\bhow\s+(?:to|do|can)\b/i
  };

  if (strongIntentPatterns[intent as keyof typeof strongIntentPatterns]?.test(query)) {
    confidence += 0.2;
  }

  return Math.min(confidence, 1.0);
}