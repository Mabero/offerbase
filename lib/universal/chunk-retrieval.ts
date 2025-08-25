/**
 * Smart Chunk Retrieval Strategy
 * Retrieves relevant chunks for candidates without query mutation
 */

import { VectorSearchService } from '../embeddings/search';
import { normalize_text } from '../context/safe-extract';

export interface Candidate {
  id: string;
  title: string;
  category?: string;
  brand?: string;
  model?: string;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  materialTitle: string;
  materialId: string;
}

/**
 * Get chunks for a specific candidate using smart query strategy
 * NEVER concatenates or mutates the original user query
 */
export async function getChunksForCandidate(
  candidate: Candidate,
  siteId: string,
  limit: number = 6
): Promise<RetrievedChunk[]> {
  const searchService = new VectorSearchService();
  
  // Build appropriate search query based on candidate type
  let searchQuery: string;
  
  if (candidate.brand && candidate.model) {
    // For products with brand+model, search specifically
    searchQuery = `${candidate.brand} ${candidate.model}`;
  } else {
    // For services/books/media, use the title
    searchQuery = candidate.title;
  }
  
  try {
    // Always pass siteId for proper scoping
    const searchResults = await searchService.hybridSearch(
      searchQuery,
      siteId,
      {
        limit: limit * 2, // Get more candidates for filtering
        similarityThreshold: 0.1 // Lower threshold for recall
      }
    );
    
    // Apply post-filter based on entity type
    const filteredChunks = applyPostFilter(searchResults, candidate);
    
    // Convert to standard format
    return filteredChunks.slice(0, limit).map(chunk => ({
      id: chunk.chunkId,
      content: chunk.content,
      materialTitle: chunk.materialTitle,
      materialId: chunk.materialId
    }));
  } catch (error) {
    console.error('Chunk retrieval error for candidate:', candidate.id, error);
    return [];
  }
}

/**
 * Apply post-filter to prevent cross-entity contamination
 * Different strategies for different entity types
 */
export function applyPostFilter(
  chunks: Array<{
    content: string;
    materialTitle: string;
    [key: string]: any;
  }>,
  candidate: Candidate
): Array<{
  content: string;
  materialTitle: string;
  [key: string]: any;
}> {
  const TIER_WORDS = ['basic', 'pro', 'premium', 'standard', 'starter', 'enterprise', 'plus', 'max', 'mini'];
  
  if (candidate.brand && candidate.model) {
    // Products with brand+model: require both to appear in content
    const brand_norm = normalize_text(candidate.brand);
    const model_norm = normalize_text(candidate.model);
    
    return chunks.filter(chunk => {
      const content_norm = normalize_text(chunk.content);
      return content_norm.includes(brand_norm) && 
             content_norm.includes(model_norm);
    });
  } else {
    // Services/books/media: title overlap filter
    const title_norm = normalize_text(candidate.title);
    const title_tokens = title_norm.split(/\s+/)
      .filter(token => 
        token.length > 2 && 
        !TIER_WORDS.includes(token) // Ignore tier words for matching
      );
    
    if (title_tokens.length === 0) {
      return chunks; // No meaningful tokens to filter on
    }
    
    return chunks.filter(chunk => {
      const content_norm = normalize_text(chunk.content);
      const materialTitle_norm = normalize_text(chunk.materialTitle);
      
      // Count matches in content or material title
      const contentMatches = title_tokens.filter(token => 
        content_norm.includes(token) || materialTitle_norm.includes(token)
      );
      
      // Require ≥2 tokens OR ≥50% overlap
      return contentMatches.length >= 2 || 
             contentMatches.length >= title_tokens.length * 0.5;
    });
  }
}

/**
 * Determine post-filter type for telemetry
 */
export function getPostFilterType(candidate: Candidate): string {
  if (candidate.brand && candidate.model) {
    return 'brand_model';
  } else {
    return 'title_overlap';
  }
}