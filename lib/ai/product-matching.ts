/**
 * Modern Product Matching Service
 * Implements smart multi-tier matching algorithm for product recommendations
 */

interface AffiliateLink {
  id: string;
  url: string;
  title: string;
  description: string | null;
  product_id: string | null;
  aliases: string[] | null;
  image_url: string | null;
  button_text: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface ProductMatch {
  product: AffiliateLink;
  confidence: number;
  matchType: 'exact_product_id' | 'exact_title' | 'exact_alias' | 'normalized_title' | 'normalized_alias' | 'fuzzy_title' | 'fuzzy_alias' | 'context_fallback';
  matchedTerm: string;
}

interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * Smart Product Matching Service
 * Uses multi-tier algorithm to find the best product matches
 */
export class ProductMatchingService {
  private affiliateLinks: AffiliateLink[];
  
  constructor(affiliateLinks: AffiliateLink[]) {
    this.affiliateLinks = affiliateLinks;
  }

  /**
   * Find the best matching products for given product names
   * @param productNames - Array of product names to match
   * @param maxResults - Maximum number of results to return
   * @param minConfidence - Minimum confidence score (0-1)
   * @returns Array of matched products sorted by confidence
   */
  findMatches(
    productNames: string[], 
    maxResults: number = 3, 
    minConfidence: number = 0.3
  ): ProductMatch[] {
    const allMatches: ProductMatch[] = [];
    
    console.log('🔍 Product Matching - Input:', { productNames, availableProducts: this.affiliateLinks.length });
    
    for (const productName of productNames) {
      const matches = this.findMatchesForProduct(productName);
      allMatches.push(...matches);
    }
    
    // Remove duplicates and sort by confidence
    const uniqueMatches = this.deduplicateMatches(allMatches);
    const sortedMatches = uniqueMatches
      .filter(match => match.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults);
    
    console.log('✅ Product Matching - Results:', sortedMatches.map(m => ({
      title: m.product.title,
      confidence: m.confidence,
      matchType: m.matchType,
      matchedTerm: m.matchedTerm
    })));
    
    return sortedMatches;
  }

  /**
   * Find matches for a single product name using multi-tier algorithm
   */
  private findMatchesForProduct(productName: string): ProductMatch[] {
    const matches: ProductMatch[] = [];
    
    for (const product of this.affiliateLinks) {
      // Tier 1: Exact Matches (confidence: 1.0)
      const exactMatch = this.checkExactMatches(productName, product);
      if (exactMatch) {
        matches.push(exactMatch);
        continue; // Skip lower tier checks if exact match found
      }
      
      // Tier 2: Normalized Matches (confidence: 0.9)
      const normalizedMatch = this.checkNormalizedMatches(productName, product);
      if (normalizedMatch) {
        matches.push(normalizedMatch);
        continue;
      }
      
      // Tier 3: Fuzzy Matches (confidence: 0.6-0.8)
      const fuzzyMatch = this.checkFuzzyMatches(productName, product);
      if (fuzzyMatch) {
        matches.push(fuzzyMatch);
      }
    }
    
    return matches;
  }

  /**
   * Tier 1: Check for exact matches
   */
  private checkExactMatches(productName: string, product: AffiliateLink): ProductMatch | null {
    // Exact product_id match
    if (product.product_id && product.product_id === productName) {
      return {
        product,
        confidence: 1.0,
        matchType: 'exact_product_id',
        matchedTerm: product.product_id
      };
    }
    
    // Exact title match
    if (product.title === productName) {
      return {
        product,
        confidence: 1.0,
        matchType: 'exact_title',
        matchedTerm: product.title
      };
    }
    
    // Exact alias match
    if (product.aliases && Array.isArray(product.aliases)) {
      for (const alias of product.aliases) {
        if (alias && alias === productName) {
          return {
            product,
            confidence: 1.0,
            matchType: 'exact_alias',
            matchedTerm: alias
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Tier 2: Check for normalized matches (case-insensitive, whitespace normalized)
   */
  private checkNormalizedMatches(productName: string, product: AffiliateLink): ProductMatch | null {
    const normalizedProductName = this.normalizeString(productName);
    
    // Normalized title match
    const normalizedTitle = this.normalizeString(product.title);
    if (normalizedTitle === normalizedProductName) {
      return {
        product,
        confidence: 0.9,
        matchType: 'normalized_title',
        matchedTerm: product.title
      };
    }
    
    // Normalized alias match
    if (product.aliases && Array.isArray(product.aliases)) {
      for (const alias of product.aliases) {
        if (alias) {
          const normalizedAlias = this.normalizeString(alias);
          if (normalizedAlias === normalizedProductName) {
            return {
              product,
              confidence: 0.9,
              matchType: 'normalized_alias',
              matchedTerm: alias
            };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Tier 3: Check for fuzzy matches (substring, word boundaries, similarity)
   */
  private checkFuzzyMatches(productName: string, product: AffiliateLink): ProductMatch | null {
    const normalizedProductName = this.normalizeString(productName);
    
    // Fuzzy title match
    const fuzzyTitleMatch = this.getFuzzyMatch(normalizedProductName, product.title);
    if (fuzzyTitleMatch) {
      return {
        product,
        confidence: fuzzyTitleMatch.confidence,
        matchType: 'fuzzy_title',
        matchedTerm: product.title
      };
    }
    
    // Fuzzy alias match
    if (product.aliases && Array.isArray(product.aliases)) {
      for (const alias of product.aliases) {
        if (alias) {
          const fuzzyAliasMatch = this.getFuzzyMatch(normalizedProductName, alias);
          if (fuzzyAliasMatch) {
            return {
              product,
              confidence: fuzzyAliasMatch.confidence,
              matchType: 'fuzzy_alias',
              matchedTerm: alias
            };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Get fuzzy match with confidence scoring
   */
  private getFuzzyMatch(searchTerm: string, target: string): { confidence: number } | null {
    const normalizedTarget = this.normalizeString(target);
    
    // Word boundary match (high confidence)
    if (this.hasWordBoundaryMatch(searchTerm, normalizedTarget)) {
      return { confidence: 0.8 };
    }
    
    // Substring match (medium confidence)
    if (normalizedTarget.includes(searchTerm) || searchTerm.includes(normalizedTarget)) {
      const longer = searchTerm.length > normalizedTarget.length ? searchTerm : normalizedTarget;
      const shorter = searchTerm.length <= normalizedTarget.length ? searchTerm : normalizedTarget;
      const confidence = 0.6 + (shorter.length / longer.length) * 0.2; // 0.6-0.8 range
      return { confidence };
    }
    
    // Levenshtein distance match (low-medium confidence)
    const distance = this.levenshteinDistance(searchTerm, normalizedTarget);
    const maxLength = Math.max(searchTerm.length, normalizedTarget.length);
    const similarity = 1 - (distance / maxLength);
    
    if (similarity >= 0.7) {
      return { confidence: 0.5 + similarity * 0.3 }; // 0.5-0.8 range
    }
    
    return null;
  }

  /**
   * Check if search term matches target with word boundaries
   */
  private hasWordBoundaryMatch(searchTerm: string, target: string): boolean {
    try {
      const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
      return regex.test(target);
    } catch {
      return false;
    }
  }

  /**
   * Normalize string for better matching
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')           // Multiple spaces to single space
      .replace(/[-_]/g, ' ')          // Hyphens and underscores to spaces
      .replace(/[^\w\s]/g, '')        // Remove special characters
      .replace(/\s+/g, '');           // Remove all spaces for final comparison
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,                    // deletion
          matrix[j - 1][i] + 1,                    // insertion
          matrix[j - 1][i - 1] + substitutionCost  // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Remove duplicate matches, keeping the highest confidence
   */
  private deduplicateMatches(matches: ProductMatch[]): ProductMatch[] {
    const seen = new Map<string, ProductMatch>();
    
    for (const match of matches) {
      const existing = seen.get(match.product.id);
      if (!existing || match.confidence > existing.confidence) {
        seen.set(match.product.id, match);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Find the most relevant product based on conversation context
   * Used as Tier 4 fallback when no direct matches found
   */
  findContextualMatch(
    currentMessage: string, 
    conversationHistory: ConversationMessage[]
  ): ProductMatch | null {
    if (this.affiliateLinks.length === 0) return null;
    
    // Extract recently mentioned products from conversation
    const recentMessages = conversationHistory.slice(-6);
    const conversationText = recentMessages
      .map(msg => msg.content.toLowerCase())
      .join(' ');
    
    const mentionedProducts: { product: AffiliateLink; frequency: number }[] = [];
    
    for (const product of this.affiliateLinks) {
      let frequency = 0;
      const variations = [
        product.title,
        product.product_id,
        ...(product.aliases || [])
      ].filter((v): v is string => Boolean(v));
      
      for (const variation of variations) {
        const normalizedVariation = this.normalizeString(variation);
        const regex = new RegExp(normalizedVariation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = conversationText.match(regex);
        if (matches) {
          frequency += matches.length;
        }
      }
      
      if (frequency > 0) {
        mentionedProducts.push({ product, frequency });
      }
    }
    
    if (mentionedProducts.length > 0) {
      // Return most frequently mentioned product
      const mostMentioned = mentionedProducts.sort((a, b) => b.frequency - a.frequency)[0];
      return {
        product: mostMentioned.product,
        confidence: 0.4 + Math.min(mostMentioned.frequency * 0.1, 0.3), // 0.4-0.7 range
        matchType: 'context_fallback',
        matchedTerm: 'conversation context'
      };
    }
    
    return null;
  }
}

/**
 * Convenience function to create and use the matching service
 */
export function findBestProductMatches(
  productNames: string[],
  affiliateLinks: AffiliateLink[],
  options: {
    maxResults?: number;
    minConfidence?: number;
    conversationContext?: {
      currentMessage: string;
      history: ConversationMessage[];
    };
  } = {}
): ProductMatch[] {
  const {
    maxResults = 3,
    minConfidence = 0.3,
    conversationContext
  } = options;
  
  const matcher = new ProductMatchingService(affiliateLinks);
  let matches = matcher.findMatches(productNames, maxResults, minConfidence);
  
  // If no matches found and we have conversation context, try contextual matching
  if (matches.length === 0 && conversationContext) {
    const contextualMatch = matcher.findContextualMatch(
      conversationContext.currentMessage,
      conversationContext.history
    );
    if (contextualMatch) {
      matches = [contextualMatch];
    }
  }
  
  return matches;
}