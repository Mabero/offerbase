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

    const { relevant_ids } = result.object;

    // Return only the products that AI deemed relevant
    const filteredProducts = products.filter(product => 
      relevant_ids.includes(product.id)
    );

    return filteredProducts;

  } catch {
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
1. **IMPORTANT: When in doubt, INCLUDE the product** - It's better to show a slightly less relevant product than to miss a good match
2. Consider CONTEXT when it's very clear - "G4 hair removal device" should NOT match "G4 vacuum cleaner"
3. Look at the full query intent, not just individual keywords
4. If the user mentions a specific category AND it clearly conflicts with a product, filter it out
5. Brand names are important - "IVISKIN G4" is different from "Dyson G4"
6. For evaluative queries ("is X good", "X vs Y"), be MORE generous - users want to see options
7. Only filter OUT products when there's a clear category mismatch

Examples of good filtering:
- Query "G4 hair removal" → Include "IVISKIN G4 Hair Removal", exclude "G4 Gaming Console"  
- Query "iPhone case" → Include phone accessories, exclude iPhone devices themselves
- Query "Is Wix good?" → Include ALL Wix products (evaluative intent = be generous)
- Query "Wix vs Squarespace" → Include both Wix AND Squarespace products
- Query "best website builder" → Include ALL website builders (don't filter by brand)
- Query "website builder alternatives" → Include ALL website builders
- Query "massage therapy" → Include massage services, exclude massage chairs/products ONLY if very clear mismatch
- Query "Wix" → Include ALL Wix products (simple brand mention = show everything)

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
  return process.env.AI_FILTER_MODEL || 'gpt-4o-mini';
}

