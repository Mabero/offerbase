/**
 * Intent detection for product display decisions
 * Categorizes user queries to determine when products should be shown
 */

export enum QueryIntent {
  TRANSACTIONAL = 'transactional',  // "buy X", "X pricing", commercial intent
  EVALUATIVE = 'evaluative',        // "is X good", "X review", seeking opinions
  COMPARATIVE = 'comparative',      // "X vs Y", "X alternatives", comparing options
  TECHNICAL = 'technical',          // "X login", "X not working", support issues
  NAVIGATIONAL = 'navigational',    // "X website", "X.com", finding the site
  INFORMATIONAL = 'informational',  // General questions about X
}

export interface IntentResult {
  intent: QueryIntent;
  confidence: number;
  shouldShowProducts: boolean;
  reason: string;
  keywords?: string[];
}

/**
 * Detect intent from user query using pattern matching
 * Returns intent classification with recommendation on showing products
 */
export function detectIntent(query: string): IntentResult {
  const lower = query.toLowerCase().trim();
  
  // Technical/Support issues - NEVER show products (prevents awkward sales pitches during problems)
  const technicalPatterns = [
    /\b(login|log in|sign in|signin|password|reset|forgot)\b/,
    /\b(down|outage|offline|maintenance|server|error|bug|broken|not working|doesn't work|won't work)\b/,
    /\b(support|help|contact|customer service|phone number)\b/,
    /\b(account|billing|invoice|payment|charge|refund)\b/,
    /\b(404|500|error code|crash|freeze|slow|loading)\b/
  ];
  
  for (const pattern of technicalPatterns) {
    if (pattern.test(lower)) {
      return {
        intent: QueryIntent.TECHNICAL,
        confidence: 0.9,
        shouldShowProducts: false,
        reason: 'Technical/support query detected',
        keywords: lower.match(pattern)?.[0].split(' ') || []
      };
    }
  }
  
  // Transactional intent - ALWAYS show products (highest commercial intent)
  const transactionalPatterns = [
    /\b(buy|purchase|order|checkout|cart|shop)\b/,
    /\b(price|pricing|cost|costs|cheap|expensive|affordable|budget)\b/,
    /\b(discount|coupon|deal|offer|sale|promo)\b/,
    /\b(free trial|trial|demo|test)\b/,
    /\b(plan|plans|subscription|upgrade|downgrade)\b/
  ];
  
  for (const pattern of transactionalPatterns) {
    if (pattern.test(lower)) {
      return {
        intent: QueryIntent.TRANSACTIONAL,
        confidence: 0.9,
        shouldShowProducts: true,
        reason: 'Transactional intent detected',
        keywords: lower.match(pattern)?.[0].split(' ') || []
      };
    }
  }
  
  // Evaluative intent - ALWAYS show products (seeking recommendations)
  const evaluativePatterns = [
    /\b(best|good|bad|great|excellent|terrible|awful|amazing)\b/,
    /\b(review|reviews|rating|ratings|opinion|opinions)\b/,
    /\b(recommend|recommendation|suggest|suggestion)\b/,
    /\b(worth|worthy|quality|reliable|trustworthy)\b/,
    /\b(pros|cons|advantages|disadvantages|benefits|drawbacks)\b/,
    /^(is|are)\s+.+(good|bad|worth|reliable|recommended)/
  ];
  
  for (const pattern of evaluativePatterns) {
    if (pattern.test(lower)) {
      return {
        intent: QueryIntent.EVALUATIVE,
        confidence: 0.8,
        shouldShowProducts: true,
        reason: 'Evaluative intent detected',
        keywords: lower.match(pattern)?.[0].split(' ') || []
      };
    }
  }
  
  // Comparative intent - ALWAYS show products (comparing options)
  const comparativePatterns = [
    /\b(vs|versus|compared to|compare|comparison)\b/,
    /\b(alternative|alternatives|instead of|rather than)\b/,
    /\b(better than|worse than|similar to|like)\b/,
    /\b(difference|differences|differ|different)\b/,
    /\b(choice|choices|choose|pick|select)\b/
  ];
  
  for (const pattern of comparativePatterns) {
    if (pattern.test(lower)) {
      return {
        intent: QueryIntent.COMPARATIVE,
        confidence: 0.9,
        shouldShowProducts: true,
        reason: 'Comparative intent detected',
        keywords: lower.match(pattern)?.[0].split(' ') || []
      };
    }
  }
  
  // Navigational intent - Show products if brand mentioned
  const navigationalPatterns = [
    /\b(website|site|homepage|url|link|domain)\b/,
    /\b(visit|go to|navigate to|find)\b/,
    /\\.com\\b|\\.org\\b|\\.net\\b/
  ];
  
  for (const pattern of navigationalPatterns) {
    if (pattern.test(lower)) {
      return {
        intent: QueryIntent.NAVIGATIONAL,
        confidence: 0.7,
        shouldShowProducts: true,
        reason: 'Navigational intent - show if brand mentioned',
        keywords: lower.match(pattern)?.[0].split(' ') || []
      };
    }
  }
  
  // Default: Informational intent - show products if mentioned
  return {
    intent: QueryIntent.INFORMATIONAL,
    confidence: 0.5,
    shouldShowProducts: true,
    reason: 'General informational query',
    keywords: []
  };
}

/**
 * Enhanced intent detection that also considers query structure
 * Handles more nuanced cases like questions vs statements
 */
export function detectIntentAdvanced(query: string, context?: { 
  userMessage?: string; 
  previousIntent?: QueryIntent;
}): IntentResult {
  const basicIntent = detectIntent(query);
  
  // Question vs statement handling
  const isQuestion = /^(what|how|why|when|where|who|which|is|are|do|does|did|can|could|would|should|will)\b/i.test(query.trim()) || 
                    query.trim().endsWith('?');
  
  // Questions about products are usually evaluative
  if (isQuestion && basicIntent.intent === QueryIntent.INFORMATIONAL) {
    // Check if question contains evaluative keywords
    if (/\b(better|best|good|recommend|should|choose|right)\b/i.test(query)) {
      return {
        ...basicIntent,
        intent: QueryIntent.EVALUATIVE,
        confidence: Math.min(basicIntent.confidence + 0.2, 0.9),
        reason: 'Question with evaluative keywords',
      };
    }
  }
  
  // Consider context from previous queries
  if (context?.previousIntent === QueryIntent.COMPARATIVE && basicIntent.intent === QueryIntent.INFORMATIONAL) {
    return {
      ...basicIntent,
      intent: QueryIntent.COMPARATIVE,
      confidence: Math.min(basicIntent.confidence + 0.1, 0.8),
      reason: 'Following up on comparative query',
    };
  }
  
  return basicIntent;
}

/**
 * Utility to extract brand/product mentions from query
 * Useful for product matching when intent is determined
 */
export function extractBrandMentions(query: string): string[] {
  // This is a simple implementation - could be enhanced with a brand dictionary
  const words = query.toLowerCase().split(/\s+/);
  const potentialBrands: string[] = [];
  
  // Look for capitalized words (likely brand names)
  const originalWords = query.split(/\s+/);
  originalWords.forEach(word => {
    if (/^[A-Z][a-zA-Z]+/.test(word) && word.length > 2) {
      potentialBrands.push(word);
    }
  });
  
  // Look for common brand patterns
  const brandPatterns = [
    /\b[A-Z][a-z]+[A-Z][a-z]+\b/, // CamelCase (WordPress, iPhone)
    /\b[A-Z]{2,}\b/, // All caps (IBM, AWS)
    /\b[A-Za-z]+\d+\b/, // Brand with numbers (iPhone14, G4)
  ];
  
  brandPatterns.forEach(pattern => {
    const matches = query.match(pattern);
    if (matches) {
      potentialBrands.push(...matches);
    }
  });
  
  return [...new Set(potentialBrands)]; // Remove duplicates
}

