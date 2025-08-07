/**
 * Domain Context Extraction
 * Analyzes training materials to extract domain/niche information for better relevance detection
 */

interface TrainingMaterial {
  title: string;
  content?: string;
  metadata?: {
    description?: string;
    keywords?: string[];
    category?: string;
    [key: string]: unknown;
  };
}

export interface DomainContext {
  productNiche?: string;
  productCategories?: string[];
  brandNames?: string[];
  commonTopics?: string[];
}

/**
 * Extract domain context from training materials
 */
export function extractDomainContext(trainingMaterials: TrainingMaterial[]): DomainContext {
  if (!trainingMaterials || trainingMaterials.length === 0) {
    return {};
  }

  const categories = new Set<string>();
  const brands = new Set<string>();
  const topics = new Set<string>();
  
  // Analyze titles and content for patterns
  trainingMaterials.forEach(material => {
    // Extract from title
    if (material.title) {
      extractFromText(material.title, categories, brands, topics);
    }
    
    // Extract from metadata
    if (material.metadata) {
      if (material.metadata.category) {
        categories.add(material.metadata.category.toLowerCase());
      }
      
      if (material.metadata.keywords) {
        material.metadata.keywords.forEach(keyword => {
          topics.add(keyword.toLowerCase());
        });
      }
      
      if (material.metadata.description) {
        extractFromText(material.metadata.description, categories, brands, topics);
      }
    }
    
    // Extract from content (first 500 chars to avoid performance issues)
    if (material.content) {
      const contentSample = material.content.substring(0, 500);
      extractFromText(contentSample, categories, brands, topics);
    }
  });

  // Determine primary niche from most common category
  const sortedCategories = Array.from(categories).sort();
  const productNiche = inferNiche(sortedCategories, Array.from(topics));

  return {
    productNiche,
    productCategories: Array.from(categories).slice(0, 10),
    brandNames: Array.from(brands).slice(0, 15),
    commonTopics: Array.from(topics).slice(0, 12)
  };
}

/**
 * Extract relevant terms from text
 */
function extractFromText(text: string, categories: Set<string>, brands: Set<string>, topics: Set<string>) {
  const words = text.toLowerCase().split(/\s+/);
  
  words.forEach(word => {
    // Clean word
    const cleanWord = word.replace(/[^a-z0-9]/g, '');
    
    if (cleanWord.length < 3) return;
    
    // Common product categories
    if (isProductCategory(cleanWord)) {
      categories.add(cleanWord);
    }
    
    // Brand names (usually capitalized in original text)
    if (isBrandName(word, text)) {
      brands.add(cleanWord);
    }
    
    // Common topics/keywords
    if (isRelevantTopic(cleanWord)) {
      topics.add(cleanWord);
    }
  });
}

/**
 * Check if word is a product category
 */
function isProductCategory(word: string): boolean {
  const productCategories = [
    'laptop', 'computer', 'phone', 'tablet', 'camera', 'headphone', 'speaker',
    'watch', 'fitness', 'health', 'beauty', 'skincare', 'makeup', 'clothing',
    'shoes', 'furniture', 'kitchen', 'appliance', 'tool', 'gadget', 'accessory',
    'book', 'game', 'toy', 'supplement', 'vitamin', 'protein', 'software',
    'app', 'service', 'course', 'training', 'education', 'travel', 'hotel',
    'restaurant', 'food', 'drink', 'beverage', 'wine', 'coffee', 'tea',
    'car', 'automotive', 'bike', 'outdoor', 'camping', 'hiking', 'sport',
    'exercise', 'music', 'audio', 'video', 'entertainment', 'streaming',
    'home', 'garden', 'pet', 'baby', 'kids', 'maternity', 'jewelry',
    'fashion', 'style', 'luxury', 'premium', 'budget', 'affordable'
  ];
  
  return productCategories.includes(word) || word.endsWith('s') && productCategories.includes(word.slice(0, -1));
}

/**
 * Check if word is likely a brand name
 */
function isBrandName(word: string, originalText: string): boolean {
  // Simple heuristic: if the word appears capitalized and is 3+ chars, might be a brand
  const capitalizedMatch = originalText.match(new RegExp(`\\b${word.charAt(0).toUpperCase()}${word.slice(1)}\\b`));
  return capitalizedMatch !== null && word.length >= 3 && word.length <= 15;
}

/**
 * Check if word is a relevant topic
 */
function isRelevantTopic(word: string): boolean {
  const relevantTopics = [
    'review', 'comparison', 'best', 'top', 'guide', 'tips', 'howto', 'tutorial',
    'price', 'cost', 'cheap', 'expensive', 'quality', 'durable', 'premium',
    'feature', 'benefit', 'advantage', 'pros', 'cons', 'rating', 'score',
    'recommendation', 'suggest', 'alternative', 'option', 'choice', 'selection',
    'buying', 'purchase', 'shop', 'store', 'online', 'delivery', 'shipping',
    'warranty', 'guarantee', 'support', 'customer', 'service', 'brand',
    'model', 'version', 'upgrade', 'latest', 'new', 'innovative', 'technology',
    'performance', 'efficiency', 'effectiveness', 'results', 'outcome'
  ];
  
  return relevantTopics.includes(word);
}

/**
 * Infer primary niche from categories and topics
 */
function inferNiche(categories: string[], topics: string[]): string {
  // Simple mapping of common categories to niches
  const nicheMapping: { [key: string]: string } = {
    'tech': 'technology and electronics',
    'laptop': 'computers and laptops',
    'computer': 'computers and technology',
    'phone': 'smartphones and mobile devices',
    'fitness': 'health and fitness',
    'health': 'health and wellness',
    'beauty': 'beauty and skincare',
    'skincare': 'beauty and skincare',
    'fashion': 'fashion and clothing',
    'clothing': 'fashion and apparel',
    'kitchen': 'kitchen and home appliances',
    'appliance': 'home appliances',
    'furniture': 'home and furniture',
    'tool': 'tools and hardware',
    'supplement': 'health supplements',
    'food': 'food and beverages',
    'automotive': 'automotive and cars',
    'car': 'automotive products',
    'outdoor': 'outdoor and camping gear',
    'sport': 'sports and fitness',
    'music': 'music and audio equipment',
    'audio': 'audio and electronics',
    'home': 'home and garden',
    'pet': 'pet products and supplies',
    'baby': 'baby and kids products'
  };

  // Find most specific niche
  for (const category of categories) {
    if (nicheMapping[category]) {
      return nicheMapping[category];
    }
  }

  // Fallback to generic description
  if (categories.length > 0) {
    return `${categories[0]} products and services`;
  }

  return 'products and services';
}