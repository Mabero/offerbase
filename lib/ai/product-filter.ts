/**
 * AI-powered context-aware product filtering
 * Prevents irrelevant matches like "G4 vacuum" showing for "G4 hair removal" queries
 */

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

interface Product {
  id: string;
  title: string;
  description?: string;
  url: string;
  image_url?: string;
  button_text: string;
}

interface FilterResult {
  relevant_ids: string[];
  reasoning?: string;
}

/**
 * Filter products using AI context understanding
 * Takes 10-20 candidates and returns only truly relevant ones
 */
export async function filterProductsWithAI(
  products: Product[],
  userQuery: string,
  enableAI: boolean = true
): Promise<Product[]> {
  // If AI filtering is disabled, return all products
  if (!enableAI || !process.env.OPENAI_API_KEY) {
    console.log('AI filtering disabled or no API key, returning all candidates');
    return products;
  }

  // If no products or query, return empty
  if (!products.length || !userQuery.trim()) {
    return [];
  }

  // If only one product, no need to filter
  if (products.length === 1) {
    return products;
  }

  try {
    console.log(`🤖 AI filtering ${products.length} products for query: "${userQuery}"`);
    
    // Create product context for AI
    const productContext = products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description?.substring(0, 200) || '', // Limit description length
    }));

    // Use AI SDK to generate structured response with Zod schema
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        relevant_ids: z.array(z.string()).describe('Array of product IDs that are actually relevant to the user query'),
        reasoning: z.string().optional().describe('Brief explanation of filtering decisions')
      }),
      prompt: buildFilteringPrompt(userQuery, productContext),
      temperature: 0.1, // Low temperature for consistent filtering
    });

    const { relevant_ids, reasoning } = result.object;

    console.log(`🎯 AI filtered to ${relevant_ids.length} relevant products`);
    if (reasoning) {
      console.log(`💭 AI reasoning: ${reasoning}`);
    }

    // Return only the products that AI deemed relevant
    const filteredProducts = products.filter(product => 
      relevant_ids.includes(product.id)
    );

    return filteredProducts;

  } catch (error) {
    console.error('❌ AI filtering error (falling back to all products):', error);
    // Graceful fallback - return all products if AI filtering fails
    return products;
  }
}

/**
 * Build the filtering prompt for the AI
 */
function buildFilteringPrompt(userQuery: string, products: Array<{id: string, title: string, description: string}>): string {
  return `You are a smart product recommendation filter. A user is searching for products, and you need to determine which candidates are actually relevant to their query.

USER QUERY: "${userQuery}"

CANDIDATE PRODUCTS:
${products.map((p, i) => 
  `${i + 1}. ID: ${p.id}
   Title: ${p.title}
   Description: ${p.description}`
).join('\n\n')}

FILTERING RULES:
1. Only return products that are genuinely relevant to the user's search intent
2. Consider CONTEXT - "G4 hair removal" should NOT match "G4 vacuum cleaner" 
3. Look at the full query, not just individual keywords
4. If the user mentions a specific category (hair removal, vacuum, gaming, etc.), filter by that context
5. Brand names are important - "IVISKIN G4" is different from "Dyson G4"
6. If in doubt, include the product (be slightly generous rather than overly restrictive)

Examples of good filtering:
- Query "G4 hair removal" → Include "IVISKIN G4 Hair Removal", exclude "G4 Gaming Console"  
- Query "iPhone case" → Include phone accessories, exclude iPhone devices themselves
- Query "massage therapy" → Include massage services, exclude massage chairs/products
- Query "tax consultation" → Include tax services, exclude tax software

Return ONLY the relevant product IDs and brief reasoning for your decisions.`;
}

/**
 * Check if AI filtering should be enabled based on environment and configuration
 */
export function shouldEnableAIFiltering(): boolean {
  const enabled = process.env.ENABLE_AI_PRODUCT_FILTERING === 'true';
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  
  return enabled && hasApiKey;
}

/**
 * Get the configured AI model for filtering (allows switching models easily)
 */
export function getFilteringModel(): string {
  return process.env.AI_FILTER_MODEL || 'gpt-3.5-turbo';
}

/**
 * Test function to verify AI filtering works correctly
 */
export async function testAIFiltering() {
  const testProducts: Product[] = [
    {
      id: '1',
      title: 'IVISKIN G4 IPL Hair Removal Device',
      description: 'Professional grade hair removal using IPL technology',
      url: 'https://example.com/iviskin-g4',
      button_text: 'View Product'
    },
    {
      id: '2', 
      title: 'Dyson G4 Vacuum Cleaner',
      description: 'Powerful cordless vacuum with G4 motor technology',
      url: 'https://example.com/dyson-g4',
      button_text: 'View Product'
    },
    {
      id: '3',
      title: 'Samsung G4 Gaming Monitor',
      description: '4K gaming monitor with G4 display technology',
      url: 'https://example.com/samsung-g4',
      button_text: 'View Product'
    }
  ];

  const testQueries = [
    'G4 hair removal device',
    'G4 vacuum cleaner', 
    'G4 gaming monitor',
    'IVISKIN G4',
    'just G4'
  ];

  for (const query of testQueries) {
    console.log(`\n=== Testing query: "${query}" ===`);
    const filtered = await filterProductsWithAI(testProducts, query, true);
    console.log(`Results: ${filtered.length} products`);
    filtered.forEach(p => console.log(`- ${p.title}`));
  }
}