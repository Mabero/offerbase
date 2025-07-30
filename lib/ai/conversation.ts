interface ConversationMessage {
  role: string;
  content: string;
}

interface AffiliateLink {
  id: string;
  url: string;
  title: string;
  description?: string;
  product_id?: string;
  aliases?: string[];
  image_url?: string;
  site_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Extract product names mentioned in the conversation
 */
export function extractMentionedProducts(
  currentMessage: string,
  conversationHistory: ConversationMessage[],
  affiliateLinks: AffiliateLink[]
): string[] {
  const mentionedProducts: string[] = [];
  const allMessages = [...conversationHistory, { role: 'user', content: currentMessage }];
  
  // Get recent messages (last 6 to focus on current conversation context)
  const recentMessages = allMessages.slice(-6);
  
  // Combine all recent message content
  const conversationText = recentMessages
    .map(msg => msg.content.toLowerCase())
    .join(' ');
  
  // Check each affiliate link for mentions
  for (const link of affiliateLinks) {
    const productVariations = [
      link.title,
      link.product_id,
      ...(link.aliases || [])
    ].filter(Boolean);
    
    for (const variation of productVariations) {
      if (!variation) continue;
      
      const variationLower = variation.toLowerCase();
      
      // Check for exact matches or word boundary matches
      const exactMatch = conversationText.includes(variationLower);
      const wordBoundaryMatch = new RegExp(`\\b${escapeRegex(variationLower)}\\b`).test(conversationText);
      
      if (exactMatch || wordBoundaryMatch) {
        // Use the main title as the canonical name
        if (!mentionedProducts.includes(link.title)) {
          mentionedProducts.push(link.title);
        }
        break; // Found a match for this product, move to next
      }
    }
  }
  
  return mentionedProducts;
}

/**
 * Find the most relevant product based on conversation context
 */
export function findMostRelevantProduct(
  currentMessage: string,
  conversationHistory: ConversationMessage[],
  affiliateLinks: AffiliateLink[]
): AffiliateLink | null {
  if (affiliateLinks.length === 0) return null;
  
  // First try to find products mentioned in recent conversation
  const mentionedProducts = extractMentionedProducts(currentMessage, conversationHistory, affiliateLinks);
  
  if (mentionedProducts.length > 0) {
    // Return the most recently mentioned product (last in array)
    const mostRecentProduct = mentionedProducts[mentionedProducts.length - 1];
    const matchedLink = affiliateLinks.find(link => link.title === mostRecentProduct);
    if (matchedLink) return matchedLink;
  }
  
  // Fallback: try to match current message against product names
  const currentMessageLower = currentMessage.toLowerCase();
  
  for (const link of affiliateLinks) {
    const productVariations = [
      link.title,
      link.product_id,
      ...(link.aliases || [])
    ].filter(Boolean);
    
    for (const variation of productVariations) {
      if (!variation) continue;
      
      const variationLower = variation.toLowerCase();
      if (currentMessageLower.includes(variationLower)) {
        return link;
      }
    }
  }
  
  // Last resort: return first product
  return affiliateLinks[0];
}

/**
 * Extract product keywords from user message for better matching
 */
export function extractProductKeywords(message: string): string[] {
  // Common product-related terms that might indicate product discussion
  const productIndicators = [
    'product', 'item', 'solution', 'tool', 'service', 'plan', 'package',
    'option', 'choice', 'version', 'model', 'type', 'kind'
  ];
  
  const messageLower = message.toLowerCase();
  const words = messageLower.split(/\W+/).filter(word => word.length > 2);
  
  // Look for potential product names (capitalized words, specific patterns)
  const keywords: string[] = [];
  
  // Add words that come after product indicators
  for (let i = 0; i < words.length - 1; i++) {
    if (productIndicators.includes(words[i])) {
      keywords.push(words[i + 1]);
    }
  }
  
  // Add potential product names (longer words that might be product names)
  const potentialProductNames = words.filter(word => 
    word.length > 3 && 
    !commonWords.has(word) &&
    !/^(this|that|what|how|when|where|why|which)$/.test(word)
  );
  
  keywords.push(...potentialProductNames);
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Common words to filter out when looking for product names
 */
const commonWords = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
  'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this',
  'it', 'from', 'be', 'are', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
  'what', 'where', 'when', 'how', 'why', 'who', 'whom', 'whose',
  'can', 'about', 'best', 'good', 'great', 'better', 'much', 'more',
  'like', 'want', 'need', 'use', 'get', 'help', 'tell', 'know',
  'price', 'cost', 'buy', 'purchase', 'sell', 'money', 'cheap', 'expensive'
]);