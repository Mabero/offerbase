export type ContentType = 'ranking' | 'comparison' | 'product_page' | 'service' | 'review' | 'tutorial' | 'general';

export interface StructuredData {
  rankings?: Array<{
    product: string;
    rank: number;
    reason?: string;
    score?: string;
  }>;
  winner?: {
    product: string;
    reason: string;
  };
  pricing?: Array<{
    product: string;
    price: string;
    currency?: string;
  }>;
  features?: Array<{
    product: string;
    features: string[];
  }>;
  recommendations?: Array<{
    context: string;
    product: string;
    reason: string;
  }>;
  comparisons?: Array<{
    products: string[];
    aspect: string;
    conclusion: string;
  }>;
  ratings?: Array<{
    product: string;
    rating: string;
    maxRating?: string;
  }>;
}

export interface ContentAnalysisResult {
  contentType: ContentType;
  structuredData: StructuredData;
  intentKeywords: string[];
  primaryProducts: string[];
  confidenceScore: number;
}

/**
 * Analyze content to determine type and extract structured data
 */
export function analyzeContentIntelligence(
  title: string,
  content: string,
  metadata?: Record<string, unknown>
): ContentAnalysisResult {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  const combinedText = `${titleLower} ${contentLower}`;

  // Detect content type
  const contentType = detectContentType(titleLower, contentLower);
  
  // Extract structured data based on content type
  const structuredData = extractStructuredData(content, contentType);
  
  // Extract intent keywords
  const intentKeywords = extractIntentKeywords(combinedText, contentType);
  
  // Extract primary products mentioned
  const primaryProducts = extractPrimaryProducts(content, contentType);
  
  // Calculate confidence score
  const confidenceScore = calculateConfidenceScore(content, contentType, structuredData);

  return {
    contentType,
    structuredData,
    intentKeywords,
    primaryProducts,
    confidenceScore
  };
}

/**
 * Detect the type of content based on patterns
 */
function detectContentType(title: string, content: string): ContentType {
  // Ranking indicators
  const rankingPatterns = [
    /\btop\s+\d+/i,
    /\bbest\s+\d+/i,
    /\d+\s+best/i,
    /ranking/i,
    /rated\s+\d+/i,
    /#\d+/,
    /first\s+place|second\s+place|third\s+place/i,
    /\d+\.\s*[A-Z]/
  ];

  // Comparison indicators  
  const comparisonPatterns = [
    /\bvs\b|\bversus\b/i,
    /compare|comparison/i,
    /\bbetter\s+than\b/i,
    /\bdifference\s+between\b/i,
    /pros\s+and\s+cons/i,
    /which\s+is\s+better/i
  ];

  // Product page indicators
  const productPagePatterns = [
    /\$\d+|\€\d+|£\d+|\d+\s*kr/,
    /price:|cost:|buy\s+now|add\s+to\s+cart/i,
    /specifications|features|description/i,
    /in\s+stock|out\s+stock|available/i
  ];

  // Review indicators
  const reviewPatterns = [
    /review|rating|stars/i,
    /\d+\/\d+|\d+\s*stars|\d+\.\d+\s*\/\s*\d+/,
    /pros:|cons:|verdict/i,
    /tested|experience|opinion/i
  ];

  // Service indicators
  const servicePatterns = [
    /service|solution|platform|software/i,
    /plan|subscription|tier/i,
    /consultation|support|help/i,
    /enterprise|business|professional/i
  ];

  // Tutorial indicators
  const tutorialPatterns = [
    /how\s+to|guide|tutorial|step/i,
    /instructions|setup|install/i,
    /\d+\s*steps|\d+\.\s*[A-Z]/
  ];

  const combinedText = `${title} ${content}`;

  // Score each content type
  const scores = {
    ranking: countPatternMatches(combinedText, rankingPatterns),
    comparison: countPatternMatches(combinedText, comparisonPatterns),
    product_page: countPatternMatches(combinedText, productPagePatterns),
    review: countPatternMatches(combinedText, reviewPatterns),
    service: countPatternMatches(combinedText, servicePatterns),
    tutorial: countPatternMatches(combinedText, tutorialPatterns)
  };

  // Return the type with highest score, or 'general' if all scores are low
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < 2) return 'general';

  return Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b)[0] as ContentType;
}

/**
 * Extract structured data based on content type
 */
function extractStructuredData(content: string, contentType: ContentType): StructuredData {
  const structuredData: StructuredData = {};

  switch (contentType) {
    case 'ranking':
      structuredData.rankings = extractRankings(content);
      structuredData.winner = extractWinner(content);
      break;
      
    case 'comparison':
      structuredData.comparisons = extractComparisons(content);
      structuredData.winner = extractWinner(content);
      break;
      
    case 'product_page':
      structuredData.pricing = extractPricing(content);
      structuredData.features = extractFeatures(content);
      break;
      
    case 'review':
      structuredData.ratings = extractRatings(content);
      structuredData.recommendations = extractRecommendations(content);
      break;
      
    case 'service':
      structuredData.pricing = extractPricing(content);
      structuredData.recommendations = extractRecommendations(content);
      break;
  }

  return structuredData;
}

/**
 * Extract rankings from content
 */
function extractRankings(content: string): Array<{ product: string; rank: number; reason?: string; score?: string }> {
  const rankings: Array<{ product: string; rank: number; reason?: string; score?: string }> = [];
  
  // Match numbered lists like "1. Product Name" or "#1 Product Name"
  const numberedPatterns = [
    /(?:^|\n)\s*(\d+)[\.\)]\s*([^\n\r]+)/gm,
    /#(\d+)[\s\-:]*([^\n\r]+)/gm,
    /(\d+)(?:st|nd|rd|th)\s*place[\s\-:]*([^\n\r]+)/gmi
  ];

  for (const pattern of numberedPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const rank = parseInt(match[1]);
      const productLine = match[2].trim();
      
      if (rank <= 20 && productLine.length > 3) { // Reasonable rank and not too short
        rankings.push({
          product: cleanProductName(productLine),
          rank,
          reason: extractReasonNearText(content, match.index, 200)
        });
      }
    }
  }

  return rankings.sort((a, b) => a.rank - b.rank);
}

/**
 * Extract winner/best choice from content
 */
function extractWinner(content: string): { product: string; reason: string } | undefined {
  const winnerPatterns = [
    /(?:our\s+)?(?:top\s+)?(?:pick|choice|recommendation|winner)[\s\-:]*([^\n\r\.]+)/gmi,
    /(?:the\s+)?best(?:\s+overall)?[\s\-:]*([^\n\r\.]+)/gmi,
    /(?:we\s+)?recommend[\s\-:]*([^\n\r\.]+)/gmi,
    /#1(?:\s+choice)?[\s\-:]*([^\n\r\.]+)/gmi
  ];

  for (const pattern of winnerPatterns) {
    const match = pattern.exec(content);
    if (match) {
      return {
        product: cleanProductName(match[1]),
        reason: extractReasonNearText(content, match.index, 300)
      };
    }
  }

  return undefined;
}

/**
 * Extract pricing information
 */
function extractPricing(content: string): Array<{ product: string; price: string; currency?: string }> {
  const pricing: Array<{ product: string; price: string; currency?: string }> = [];
  
  // Match patterns like "$99", "€50", "£30", "100 kr"
  const pricePattern = /([^\n\r]{10,50}?)\s*(?:costs?|priced?\s+at|starts?\s+at)?\s*[\$€£]?(\d+(?:\.\d{2})?)\s*(usd|eur|gbp|kr|dollars?|euros?|pounds?|kroner?)?/gmi;
  
  let match;
  while ((match = pricePattern.exec(content)) !== null) {
    const productName = cleanProductName(match[1]);
    const price = match[2];
    const currency = match[3] || detectCurrencyFromSymbol(match[0]);
    
    if (productName.length > 2) {
      pricing.push({ product: productName, price, currency });
    }
  }

  return pricing;
}

/**
 * Extract features for products
 */
function extractFeatures(content: string): Array<{ product: string; features: string[] }> {
  // This is a simplified version - could be enhanced with more sophisticated NLP
  const features: Array<{ product: string; features: string[] }> = [];
  
  // Look for feature lists after product names
  const sections = content.split(/\n\s*\n/);
  
  for (const section of sections) {
    if (section.includes('features') || section.includes('specifications')) {
      const lines = section.split('\n');
      const productLine = lines.find(line => line.length > 10 && line.length < 100);
      const featureLines = lines.filter(line => 
        line.trim().startsWith('•') || 
        line.trim().startsWith('-') || 
        line.trim().startsWith('*')
      );
      
      if (productLine && featureLines.length > 0) {
        features.push({
          product: cleanProductName(productLine),
          features: featureLines.map(f => f.replace(/^[\s\•\-\*]+/, '').trim())
        });
      }
    }
  }

  return features;
}

/**
 * Extract ratings and scores
 */
function extractRatings(content: string): Array<{ product: string; rating: string; maxRating?: string }> {
  const ratings: Array<{ product: string; rating: string; maxRating?: string }> = [];
  
  const ratingPattern = /([^\n\r]{10,50}?)\s*(?:rated|scores?|gets)\s*(\d+(?:\.\d+)?)\s*(?:\/|out\s+of)\s*(\d+)/gmi;
  
  let match;
  while ((match = ratingPattern.exec(content)) !== null) {
    ratings.push({
      product: cleanProductName(match[1]),
      rating: match[2],
      maxRating: match[3]
    });
  }

  return ratings;
}

/**
 * Extract recommendations with context
 */
function extractRecommendations(content: string): Array<{ context: string; product: string; reason: string }> {
  const recommendations: Array<{ context: string; product: string; reason: string }> = [];
  
  const recPatterns = [
    /(?:for|if)\s+([^,\n]{10,80})[,\s]+(?:we\s+)?(?:recommend|suggest|choose)\s+([^\n\r\.]+)/gmi,
    /([^\n\r]{20,100})\s+(?:is\s+)?(?:perfect|ideal|best)\s+(?:for|if)\s+([^\n\r\.]+)/gmi
  ];

  for (const pattern of recPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      recommendations.push({
        context: match[1].trim(),
        product: cleanProductName(match[2]),
        reason: extractReasonNearText(content, match.index, 200)
      });
    }
  }

  return recommendations;
}

/**
 * Extract comparisons between products
 */
function extractComparisons(content: string): Array<{ products: string[]; aspect: string; conclusion: string }> {
  const comparisons: Array<{ products: string[]; aspect: string; conclusion: string }> = [];
  
  // Look for "X vs Y" patterns
  const vsPattern = /([^\n\r]{5,50})\s+(?:vs\.?|versus)\s+([^\n\r]{5,50})/gmi;
  
  let match;
  while ((match = vsPattern.exec(content)) !== null) {
    const products = [cleanProductName(match[1]), cleanProductName(match[2])];
    const context = extractContextAroundMatch(content, match.index, 300);
    
    comparisons.push({
      products,
      aspect: 'general comparison',
      conclusion: context
    });
  }

  return comparisons;
}

/**
 * Extract intent keywords based on content type
 */
function extractIntentKeywords(text: string, contentType: ContentType): string[] {
  const commonKeywords = extractCommonKeywords(text);
  
  const typeSpecificKeywords: Record<ContentType, string[]> = {
    ranking: ['best', 'top', 'ranking', 'rated', 'winner', 'choice'],
    comparison: ['vs', 'versus', 'compare', 'better', 'difference', 'choice'],
    product_page: ['buy', 'price', 'cost', 'features', 'specifications'],
    review: ['review', 'rating', 'opinion', 'tested', 'verdict'],
    service: ['service', 'solution', 'plan', 'support', 'business'],
    tutorial: ['how', 'guide', 'steps', 'tutorial', 'setup'],
    general: []
  };

  return [...new Set([...commonKeywords, ...typeSpecificKeywords[contentType]])];
}

/**
 * Extract primary products mentioned in content
 */
function extractPrimaryProducts(content: string, contentType: ContentType): string[] {
  const products: string[] = [];
  
  // Different extraction strategies based on content type
  switch (contentType) {
    case 'ranking':
      const rankings = extractRankings(content);
      products.push(...rankings.slice(0, 5).map(r => r.product));
      break;
      
    case 'comparison':
      const comparisons = extractComparisons(content);
      comparisons.forEach(c => products.push(...c.products));
      break;
      
    default:
      // Generic product name extraction
      products.push(...extractGenericProductNames(content));
  }

  return [...new Set(products)].slice(0, 10); // Dedupe and limit
}

/**
 * Calculate confidence score for the analysis
 */
function calculateConfidenceScore(
  content: string, 
  contentType: ContentType, 
  structuredData: StructuredData
): number {
  let score = 0.3; // Base score

  // Content length factor
  const wordCount = content.split(/\s+/).length;
  score += Math.min(wordCount / 1000, 0.3); // Up to 0.3 for length

  // Structured data factor
  const dataPoints = Object.values(structuredData).reduce((sum, arr) => 
    sum + (Array.isArray(arr) ? arr.length : arr ? 1 : 0), 0
  );
  score += Math.min(dataPoints / 10, 0.4); // Up to 0.4 for structured data

  return Math.min(score, 1.0);
}

// Helper functions
function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
}

function cleanProductName(name: string): string {
  return name
    .replace(/^\d+[\.\)]\s*/, '') // Remove leading numbers
    .replace(/^#+\s*/, '') // Remove leading hash symbols
    .replace(/[^\w\s\-]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 100); // Limit length
}

function extractReasonNearText(content: string, index: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + radius);
  return content.substring(start, end).trim();
}

function extractContextAroundMatch(content: string, index: number, radius: number): string {
  return extractReasonNearText(content, index, radius);
}

function detectCurrencyFromSymbol(text: string): string | undefined {
  if (text.includes('$')) return 'USD';
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('kr')) return 'NOK';
  return undefined;
}

function extractCommonKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\W+/);
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by']);
  
  return words
    .filter(word => word.length > 3 && !stopWords.has(word))
    .reduce((acc, word) => {
      if (!acc.includes(word)) acc.push(word);
      return acc;
    }, [] as string[])
    .slice(0, 20);
}

function extractGenericProductNames(content: string): string[] {
  // Simple heuristic for product names - could be enhanced
  const lines = content.split('\n');
  const potentialProducts: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 100 && 
        /^[A-Z]/.test(trimmed) && // Starts with capital
        !/^(the|a|an|this|that|these|those)\s/i.test(trimmed)) { // Not starting with articles
      potentialProducts.push(cleanProductName(trimmed));
    }
  }
  
  return potentialProducts.slice(0, 10);
}