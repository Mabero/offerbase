/**
 * Intelligent validation system for AI responses
 * Provides flexible, context-aware validation instead of rigid rule enforcement
 */

export interface ValidationConfig {
  strictnessLevel: 'strict' | 'moderate' | 'flexible';
  allowSemanticInference: boolean;
  allowPartialMatches: boolean;
  minConfidenceThreshold: number;
  contextWindowSize: number;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reasoning: string;
  suggestions?: string[];
  relatedTopics?: string[];
}

// Default configuration for balanced validation
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strictnessLevel: 'moderate',
  allowSemanticInference: true,
  allowPartialMatches: true,
  minConfidenceThreshold: 0.3,
  contextWindowSize: 1000
};

/**
 * Validate if a response is appropriate based on available training materials
 */
export function validateResponseIntelligently(
  userQuery: string,
  aiResponse: string,
  trainingContext: string,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  // Calculate confidence based on multiple factors
  const confidence = calculateResponseConfidence(
    userQuery,
    aiResponse,
    trainingContext,
    config
  );
  
  // Determine if response is valid based on confidence and config
  const isValid = confidence >= config.minConfidenceThreshold;
  
  // Generate reasoning for the validation decision
  const reasoning = generateValidationReasoning(
    confidence,
    userQuery,
    trainingContext,
    config
  );
  
  // Suggest related topics if confidence is low
  const suggestions = confidence < 0.5 
    ? findRelatedTopics(userQuery, trainingContext)
    : undefined;
  
  return {
    isValid,
    confidence,
    reasoning,
    suggestions,
    relatedTopics: suggestions
  };
}

/**
 * Calculate confidence score for a response
 */
function calculateResponseConfidence(
  userQuery: string,
  aiResponse: string,
  trainingContext: string,
  config: ValidationConfig
): number {
  let confidence = 0;
  const queryLower = userQuery.toLowerCase();
  const contextLower = trainingContext.toLowerCase();
  
  // Direct keyword matching
  const queryKeywords = extractKeywords(queryLower);
  const contextKeywords = extractKeywords(contextLower);
  const keywordOverlap = calculateKeywordOverlap(queryKeywords, contextKeywords);
  confidence += keywordOverlap * 0.3;
  
  // Semantic similarity (simplified)
  if (config.allowSemanticInference) {
    const semanticScore = calculateSemanticSimilarity(userQuery, trainingContext);
    confidence += semanticScore * 0.3;
  }
  
  // Topic relevance
  const topicRelevance = calculateTopicRelevance(userQuery, trainingContext);
  confidence += topicRelevance * 0.2;
  
  // Context coverage
  const contextCoverage = calculateContextCoverage(userQuery, trainingContext);
  confidence += contextCoverage * 0.2;
  
  // Apply strictness modifiers
  confidence = applyStrictnessModifier(confidence, config.strictnessLevel);
  
  return Math.min(Math.max(confidence, 0), 1);
}

/**
 * Calculate keyword overlap between query and context
 */
function calculateKeywordOverlap(queryKeywords: string[], contextKeywords: string[]): number {
  if (queryKeywords.length === 0) return 0;
  
  const contextSet = new Set(contextKeywords);
  let matches = 0;
  
  for (const keyword of queryKeywords) {
    if (contextSet.has(keyword)) {
      matches++;
    } else {
      // Check for partial matches
      for (const contextWord of contextKeywords) {
        if (contextWord.includes(keyword) || keyword.includes(contextWord)) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  return matches / queryKeywords.length;
}

/**
 * Calculate semantic similarity between query and context
 */
function calculateSemanticSimilarity(query: string, context: string): number {
  // Simplified semantic similarity using concept groups
  const conceptGroups = [
    ['recommend', 'suggest', 'best', 'top', 'choose', 'pick', 'select'],
    ['price', 'cost', 'expensive', 'cheap', 'affordable', 'budget'],
    ['quality', 'good', 'bad', 'reliable', 'durable', 'performance'],
    ['feature', 'function', 'capability', 'specification', 'attribute'],
    ['compare', 'difference', 'versus', 'better', 'worse', 'similar']
  ];
  
  let similarity = 0;
  const queryLower = query.toLowerCase();
  const contextLower = context.toLowerCase();
  
  for (const group of conceptGroups) {
    const queryHasConcept = group.some(term => queryLower.includes(term));
    const contextHasConcept = group.some(term => contextLower.includes(term));
    
    if (queryHasConcept && contextHasConcept) {
      similarity += 0.2;
    }
  }
  
  return Math.min(similarity, 1);
}

/**
 * Calculate topic relevance between query and context
 */
function calculateTopicRelevance(query: string, context: string): number {
  // Extract main topics/entities from query
  const queryTopics = extractTopics(query);
  const contextLower = context.toLowerCase();
  
  if (queryTopics.length === 0) return 0.5; // Neutral score if no specific topics
  
  let relevance = 0;
  for (const topic of queryTopics) {
    if (contextLower.includes(topic.toLowerCase())) {
      relevance += 1;
    } else {
      // Check for related terms
      const relatedTerms = getRelatedTerms(topic);
      for (const term of relatedTerms) {
        if (contextLower.includes(term.toLowerCase())) {
          relevance += 0.5;
          break;
        }
      }
    }
  }
  
  return Math.min(relevance / queryTopics.length, 1);
}

/**
 * Calculate how well the context covers the query requirements
 */
function calculateContextCoverage(query: string, context: string): number {
  // Check if context has substantial information
  if (context.length < 100) return 0.1;
  if (context.length < 300) return 0.3;
  if (context.length < 1000) return 0.5;
  
  // Check for question type coverage
  const questionType = detectQuestionType(query);
  const hasRelevantContent = checkContentForQuestionType(context, questionType);
  
  return hasRelevantContent ? 0.8 : 0.4;
}

/**
 * Apply strictness level modifier to confidence score
 */
function applyStrictnessModifier(confidence: number, strictness: 'strict' | 'moderate' | 'flexible'): number {
  switch (strictness) {
    case 'strict':
      return confidence * 0.8; // Reduce confidence for stricter validation
    case 'flexible':
      return Math.min(confidence * 1.2, 1); // Boost confidence for flexible validation
    default:
      return confidence; // No modification for moderate
  }
}

/**
 * Generate human-readable reasoning for validation decision
 */
function generateValidationReasoning(
  confidence: number,
  query: string,
  context: string,
  config: ValidationConfig
): string {
  if (confidence >= 0.7) {
    return 'High confidence: The training materials contain relevant information to answer this query.';
  } else if (confidence >= 0.5) {
    return 'Moderate confidence: The training materials contain related information that can address the query.';
  } else if (confidence >= config.minConfidenceThreshold) {
    return 'Low confidence: The training materials have some relevant context, though not comprehensive.';
  } else {
    return 'Insufficient confidence: The training materials may not contain enough relevant information for this specific query.';
  }
}

/**
 * Find related topics in the training context
 */
function findRelatedTopics(query: string, context: string): string[] {
  const topics: string[] = [];
  const contextLower = context.toLowerCase();
  
  // Extract potential topics from context
  const commonTopics = [
    'features', 'pricing', 'comparison', 'reviews', 
    'specifications', 'benefits', 'usage', 'installation'
  ];
  
  for (const topic of commonTopics) {
    if (contextLower.includes(topic)) {
      topics.push(topic);
    }
  }
  
  return topics.slice(0, 3); // Return top 3 related topics
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
    'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
    'it', 'from', 'be', 'are', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'what', 'where', 'when', 'how', 'why', 'who', 'whom', 'whose'
  ]);
  
  return text
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.toLowerCase());
}

/**
 * Extract main topics/entities from query
 */
function extractTopics(query: string): string[] {
  // Simple noun extraction (would be better with NLP library)
  const words = query.split(/\s+/);
  const topics: string[] = [];
  
  for (const word of words) {
    // Simple heuristic: capitalized words or longer words are likely topics
    if (word.length > 4 || /^[A-Z]/.test(word)) {
      topics.push(word);
    }
  }
  
  return topics;
}

/**
 * Get semantically related terms for a topic
 */
function getRelatedTerms(topic: string): string[] {
  // Simple related terms mapping (would be better with word embeddings)
  const relatedTermsMap: Record<string, string[]> = {
    'product': ['item', 'goods', 'merchandise'],
    'price': ['cost', 'pricing', 'fee', 'charge'],
    'quality': ['grade', 'standard', 'excellence'],
    'feature': ['function', 'capability', 'specification'],
    'review': ['feedback', 'rating', 'opinion', 'testimonial']
  };
  
  const topicLower = topic.toLowerCase();
  return relatedTermsMap[topicLower] || [];
}

/**
 * Detect the type of question being asked
 */
function detectQuestionType(query: string): string {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('how') || queryLower.includes('guide')) return 'how-to';
  if (queryLower.includes('what') || queryLower.includes('which')) return 'definition';
  if (queryLower.includes('why')) return 'explanation';
  if (queryLower.includes('compare') || queryLower.includes('versus')) return 'comparison';
  if (queryLower.includes('best') || queryLower.includes('recommend')) return 'recommendation';
  if (queryLower.includes('price') || queryLower.includes('cost')) return 'pricing';
  
  return 'general';
}

/**
 * Check if content is relevant for the question type
 */
function checkContentForQuestionType(context: string, questionType: string): boolean {
  const contextLower = context.toLowerCase();
  
  switch (questionType) {
    case 'how-to':
      return contextLower.includes('step') || contextLower.includes('guide') || contextLower.includes('process');
    case 'comparison':
      return contextLower.includes('compare') || contextLower.includes('versus') || contextLower.includes('difference');
    case 'recommendation':
      return contextLower.includes('recommend') || contextLower.includes('best') || contextLower.includes('suggest');
    case 'pricing':
      return contextLower.includes('price') || contextLower.includes('cost') || contextLower.includes('$');
    default:
      return true; // General questions can be answered with any content
  }
}

/**
 * Get validation config based on site settings
 */
export function getValidationConfig(siteSettings?: {
  strictnessLevel?: 'strict' | 'moderate' | 'flexible';
  allowInference?: boolean;
}): ValidationConfig {
  return {
    strictnessLevel: siteSettings?.strictnessLevel || 'moderate',
    allowSemanticInference: siteSettings?.allowInference !== false,
    allowPartialMatches: true,
    minConfidenceThreshold: siteSettings?.strictnessLevel === 'strict' ? 0.5 : 0.3,
    contextWindowSize: 1000
  };
}