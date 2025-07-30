import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { analyzeQueryIntent, QueryAnalysis } from './query-intent';
import { ContentType, StructuredData } from './content-intelligence';

interface TrainingMaterial {
  id: string;
  title: string;
  content?: string | null;
  summary?: string | null;
  key_points?: string[];
  metadata?: Record<string, unknown>;
  content_type?: ContentType;
  structured_data?: StructuredData;
  intent_keywords?: string[];
  primary_products?: string[];
  confidence_score?: number;
}

interface ContextItem {
  title: string;
  content: string;
  relevance: number;
  contentType?: ContentType;
  structuredData?: StructuredData;
}

/**
 * Select the most relevant training materials for a given query
 * Uses intelligent query analysis and dynamic content scoring
 */
export async function selectRelevantContext(
  query: string,
  siteId: string,
  maxItems: number = 7, // Increased default for better context
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<ContextItem[]> {
  const supabase = createSupabaseAdminClient();
  
  // Analyze the query intent
  const queryAnalysis = analyzeQueryIntent(query, conversationHistory);
  
  // Fetch all training materials with enhanced fields
  const { data: materials, error } = await supabase
    .from('training_materials')
    .select('id, title, content, summary, key_points, metadata, content_type, structured_data, intent_keywords, primary_products, confidence_score')
    .eq('site_id', siteId)
    .eq('scrape_status', 'success')
    .or('content.not.is.null,summary.not.is.null');

  if (error || !materials || materials.length === 0) {
    return [];
  }

  // Score and rank materials by enhanced relevance
  const scoredMaterials = materials.map(material => ({
    material,
    score: calculateEnhancedRelevance(query, material, queryAnalysis)
  }));

  // Sort by relevance score
  scoredMaterials.sort((a, b) => b.score - a.score);

  // Take top N materials and format for context
  const relevantItems: ContextItem[] = [];
  
  for (let i = 0; i < Math.min(maxItems, scoredMaterials.length); i++) {
    const { material, score } = scoredMaterials[i];
    
    // Skip items with very low relevance
    if (score < 0.1) break;
    
    // Use summary if available, otherwise truncate content
    let contextContent = '';
    
    if (material.summary) {
      contextContent = material.summary;
      
      // Add key points if available
      if (material.key_points && material.key_points.length > 0) {
        contextContent += '\n\nKey points:\n' + material.key_points.map((p: string) => `- ${p}`).join('\n');
      }
    } else if (material.content) {
      // Use first 1000 chars of content if no summary
      contextContent = material.content.substring(0, 1000);
      if (material.content.length > 1000) {
        contextContent += '...';
      }
    }
    
    relevantItems.push({
      title: material.title,
      content: contextContent,
      relevance: score,
      contentType: material.content_type,
      structuredData: material.structured_data
    });
  }
  
  return relevantItems;
}

/**
 * Calculate enhanced relevance score between query and material using query intent analysis
 */
function calculateEnhancedRelevance(
  query: string, 
  material: TrainingMaterial, 
  queryAnalysis: QueryAnalysis
): number {
  const queryWords = extractKeywords(query.toLowerCase());
  let score = 0;
  
  // Base relevance calculation
  score += calculateBaseRelevance(queryWords, material);
  
  // Content type boost based on query intent
  const contentTypeBoost = getContentTypeBoost(material.content_type, queryAnalysis);
  score *= contentTypeBoost;
  
  // Structured data relevance boost
  score += calculateStructuredDataRelevance(material.structured_data, queryAnalysis);
  
  // Intent keywords matching
  score += calculateIntentKeywordMatching(material.intent_keywords, queryAnalysis.keywords);
  
  // Product matching boost
  score += calculateProductMatchingBoost(material.primary_products, queryAnalysis.products);
  
  // Confidence score factor
  const confidenceFactor = (material.confidence_score || 0.5) * 0.2;
  score += confidenceFactor;
  
  // Special boosts for recommendation-seeking queries
  if (queryAnalysis.isLookingForRecommendation) {
    score += calculateRecommendationBoost(material);
  }
  
  // Normalize score to reasonable range
  return Math.min(score, 3.0);
}

/**
 * Calculate base relevance using traditional keyword matching
 */
function calculateBaseRelevance(queryWords: string[], material: TrainingMaterial): number {
  let score = 0;
  
  // Title matching (highest weight)
  const titleWords = extractKeywords(material.title.toLowerCase());
  const titleMatches = countMatches(queryWords, titleWords);
  score += titleMatches * 0.4;
  
  // Summary/content matching
  if (material.summary) {
    const summaryWords = extractKeywords(material.summary.toLowerCase());
    const summaryMatches = countMatches(queryWords, summaryWords);
    score += summaryMatches * 0.3;
  } else if (material.content) {
    const contentPreview = material.content.substring(0, 500).toLowerCase();
    const contentWords = extractKeywords(contentPreview);
    const contentMatches = countMatches(queryWords, contentWords);
    score += contentMatches * 0.2;
  }
  
  // Key points matching
  if (material.key_points && material.key_points.length > 0) {
    const keyPointsText = material.key_points.join(' ').toLowerCase();
    const keyPointWords = extractKeywords(keyPointsText);
    const keyPointMatches = countMatches(queryWords, keyPointWords);
    score += keyPointMatches * 0.3;
  }
  
  return Math.min(score / Math.max(queryWords.length, 1), 1);
}

/**
 * Get content type boost based on query analysis
 */
function getContentTypeBoost(contentType: ContentType | undefined, queryAnalysis: QueryAnalysis): number {
  if (!contentType) return 1.0;
  
  const boostMap: Record<ContentType, number> = {
    ranking: queryAnalysis.contextBoosts.ranking,
    comparison: queryAnalysis.contextBoosts.comparison,
    product_page: queryAnalysis.contextBoosts.product_page,
    review: queryAnalysis.contextBoosts.review,
    service: queryAnalysis.contextBoosts.service,
    tutorial: queryAnalysis.contextBoosts.tutorial,
    general: queryAnalysis.contextBoosts.general
  };
  
  return boostMap[contentType] || 1.0;
}

/**
 * Calculate relevance boost from structured data
 */
function calculateStructuredDataRelevance(structuredData: StructuredData | undefined, queryAnalysis: QueryAnalysis): number {
  if (!structuredData) return 0;
  
  let boost = 0;
  
  // Boost for rankings when looking for best choice
  if (queryAnalysis.intent === 'best_choice' && structuredData.rankings) {
    boost += structuredData.rankings.length * 0.1;
    // Extra boost if there's a clear winner
    if (structuredData.winner) {
      boost += 0.3;
    }
  }
  
  // Boost for comparisons when query is comparative
  if (queryAnalysis.isComparative && structuredData.comparisons) {
    boost += structuredData.comparisons.length * 0.1;
  }
  
  // Boost for pricing when query is about pricing
  if (queryAnalysis.intent === 'pricing' && structuredData.pricing) {
    boost += structuredData.pricing.length * 0.15;
  }
  
  // Boost for recommendations when seeking recommendations
  if (queryAnalysis.isLookingForRecommendation && structuredData.recommendations) {
    boost += structuredData.recommendations.length * 0.1;
  }
  
  return Math.min(boost, 0.5);
}

/**
 * Calculate matching score for intent keywords
 */
function calculateIntentKeywordMatching(materialKeywords: string[] | undefined, queryKeywords: string[]): number {
  if (!materialKeywords || materialKeywords.length === 0) return 0;
  
  const matches = materialKeywords.filter(keyword => 
    queryKeywords.some(qKeyword => 
      keyword.toLowerCase().includes(qKeyword.toLowerCase()) ||
      qKeyword.toLowerCase().includes(keyword.toLowerCase())
    )
  );
  
  return Math.min(matches.length * 0.1, 0.3);
}

/**
 * Calculate boost for product matching
 */
function calculateProductMatchingBoost(materialProducts: string[] | undefined, queryProducts: string[]): number {
  if (!materialProducts || materialProducts.length === 0 || queryProducts.length === 0) return 0;
  
  let matches = 0;
  for (const queryProduct of queryProducts) {
    for (const materialProduct of materialProducts) {
      if (queryProduct.toLowerCase().includes(materialProduct.toLowerCase()) ||
          materialProduct.toLowerCase().includes(queryProduct.toLowerCase())) {
        matches++;
        break;
      }
    }
  }
  
  return Math.min(matches * 0.2, 0.4);
}

/**
 * Calculate boost for recommendation-seeking queries
 */
function calculateRecommendationBoost(material: TrainingMaterial): number {
  let boost = 0;
  
  // Boost for content types that typically contain recommendations
  if (material.content_type === 'ranking') boost += 0.3;
  if (material.content_type === 'review') boost += 0.2;
  if (material.content_type === 'comparison') boost += 0.25;
  
  // Boost for materials with winner/best choice in structured data
  if (material.structured_data?.winner) boost += 0.2;
  if (material.structured_data?.recommendations) boost += 0.15;
  
  return Math.min(boost, 0.4);
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  // Remove common stop words
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
    'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
    'it', 'from', 'be', 'are', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'what', 'where', 'when', 'how', 'why', 'who', 'whom', 'whose'
  ]);
  
  // Split by word boundaries and filter
  const words = text
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return [...new Set(words)]; // Remove duplicates
}

/**
 * Count matching keywords between two sets
 */
function countMatches(queryWords: string[], targetWords: string[]): number {
  const targetSet = new Set(targetWords);
  return queryWords.filter(word => targetSet.has(word)).length;
}

/**
 * Build optimized context string for AI prompt with structured data
 */
export function buildOptimizedContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) {
    return '';
  }
  
  let context = '\n\nRelevant Training Materials:\n';
  
  contextItems.forEach((item, index) => {
    context += `\n${index + 1}. ${item.title} (${item.contentType || 'general'} - relevance: ${(item.relevance * 100).toFixed(0)}%):\n`;
    context += `${item.content}\n`;
    
    // Add structured data if available and relevant
    if (item.structuredData && Object.keys(item.structuredData).length > 0) {
      context += `\nStructured Information:\n`;
      
      // Add rankings
      if (item.structuredData.rankings && item.structuredData.rankings.length > 0) {
        context += `Rankings: ${item.structuredData.rankings.map(r => `#${r.rank}: ${r.product}`).join(', ')}\n`;
      }
      
      // Add winner
      if (item.structuredData.winner) {
        context += `Winner/Best Choice: ${item.structuredData.winner.product} (${item.structuredData.winner.reason})\n`;
      }
      
      // Add recommendations
      if (item.structuredData.recommendations && item.structuredData.recommendations.length > 0) {
        context += `Recommendations: ${item.structuredData.recommendations.map(r => `${r.product} for ${r.context}`).join(', ')}\n`;
      }
      
      // Add pricing info
      if (item.structuredData.pricing && item.structuredData.pricing.length > 0) {
        context += `Pricing: ${item.structuredData.pricing.map(p => `${p.product}: ${p.price}${p.currency ? ` ${p.currency}` : ''}`).join(', ')}\n`;
      }
    }
  });
  
  return context;
}