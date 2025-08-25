import { normalizeText } from './normalization';
import type { SearchResult } from '../embeddings/types';
import type { OfferCandidate } from './resolver';

/**
 * Post-filter result with fallback information
 */
export interface FilterResult {
  filtered: SearchResult[];
  fallback: boolean;      // True if model-only fallback was used
  method: 'brand_model' | 'model_only' | 'none';  // Which filter was applied
  originalCount: number;  // Original chunk count before filtering
}

/**
 * Post-filter RAG chunks by offer brand/model to prevent G3/G4 mixing
 * 
 * KEY COMPONENT: This function prevents specification leakage between similar products
 * 
 * Strategy (Requirement #5 from plan):
 * 1. First try: Filter chunks that mention BOTH brand AND model (when present)
 * 2. Fallback: If zero results and model exists, try model-only filter  
 * 3. Clean refusal: If still zero results, caller should refuse rather than guess
 * 
 * Examples:
 * - Query "G3 weight" with IVISKIN G3 winner → Only show chunks mentioning "iviskin" AND "g3"
 * - If no chunks have both → Try chunks with just "g3"
 * - If still none → Clean refusal (don't guess from G4 specs)
 * 
 * @param chunks - RAG search results to filter
 * @param offer - Winning offer with normalized brand/model
 * @returns FilterResult with filtered chunks and metadata
 */
export function filterChunksByOffer(
  chunks: SearchResult[],
  offer: Pick<OfferCandidate, 'brand_norm' | 'model_norm'>
): FilterResult {
  const originalCount = chunks.length;
  
  // If no brand or model, no filtering needed
  if (!offer.brand_norm && !offer.model_norm) {
    return {
      filtered: chunks,
      fallback: false,
      method: 'none',
      originalCount
    };
  }
  
  // Strategy 1: Brand AND model filtering (strictest)
  let filtered: SearchResult[] = [];
  
  if (offer.brand_norm && offer.model_norm) {
    filtered = chunks.filter(chunk => {
      const contentNorm = normalizeText(chunk.content);
      const hasBrand = contentNorm.includes(offer.brand_norm!);
      const hasModel = contentNorm.includes(offer.model_norm!);
      return hasBrand && hasModel;
    });
    
    // If we got results with brand+model, use them
    if (filtered.length > 0) {
      return {
        filtered,
        fallback: false,
        method: 'brand_model',
        originalCount
      };
    }
  }
  
  // Strategy 2: Model-only fallback (Requirement #5)
  // Only try this if we have a model and brand+model gave us nothing
  if (offer.model_norm) {
    filtered = chunks.filter(chunk => {
      const contentNorm = normalizeText(chunk.content);
      return contentNorm.includes(offer.model_norm!);
    });
    
    if (filtered.length > 0) {
      return {
        filtered,
        fallback: true,  // Mark as fallback for telemetry
        method: 'model_only',
        originalCount
      };
    }
  }
  
  // Strategy 3: Brand-only fallback (if no model but have brand)
  if (offer.brand_norm && !offer.model_norm) {
    filtered = chunks.filter(chunk => {
      const contentNorm = normalizeText(chunk.content);
      return contentNorm.includes(offer.brand_norm!);
    });
    
    if (filtered.length > 0) {
      return {
        filtered,
        fallback: false,
        method: 'brand_model', // Not really fallback since no model exists
        originalCount
      };
    }
  }
  
  // No chunks survived filtering - caller should do clean refusal
  return {
    filtered: [],
    fallback: false,
    method: 'none',
    originalCount
  };
}

/**
 * Enhanced filter for debugging and telemetry
 * Returns additional information about what was matched
 */
export interface DetailedFilterResult extends FilterResult {
  matchStats: {
    brandMatches: number;    // Chunks mentioning brand
    modelMatches: number;    // Chunks mentioning model  
    bothMatches: number;     // Chunks mentioning both
    neitherMatches: number;  // Chunks mentioning neither
  };
  sampleMatches: string[];   // First few matching chunk excerpts for debugging
}

/**
 * Detailed post-filter for debugging and telemetry
 * Provides statistics about what was matched for analysis
 */
export function filterChunksDetailed(
  chunks: SearchResult[],
  offer: Pick<OfferCandidate, 'brand_norm' | 'model_norm'>
): DetailedFilterResult {
  const basicResult = filterChunksByOffer(chunks, offer);
  
  // Calculate match statistics
  let brandMatches = 0;
  let modelMatches = 0;
  let bothMatches = 0;
  let neitherMatches = 0;
  
  const sampleMatches: string[] = [];
  
  chunks.forEach(chunk => {
    const contentNorm = normalizeText(chunk.content);
    const hasBrand = offer.brand_norm ? contentNorm.includes(offer.brand_norm) : false;
    const hasModel = offer.model_norm ? contentNorm.includes(offer.model_norm) : false;
    
    if (hasBrand) brandMatches++;
    if (hasModel) modelMatches++;
    if (hasBrand && hasModel) bothMatches++;
    if (!hasBrand && !hasModel) neitherMatches++;
    
    // Collect sample matches for debugging
    if ((hasBrand || hasModel) && sampleMatches.length < 3) {
      // Get first 100 chars around the match for context
      const excerpt = chunk.content.length > 100 
        ? chunk.content.substring(0, 100) + '...'
        : chunk.content;
      sampleMatches.push(excerpt);
    }
  });
  
  return {
    ...basicResult,
    matchStats: {
      brandMatches,
      modelMatches,
      bothMatches,
      neitherMatches
    },
    sampleMatches
  };
}

/**
 * Validate post-filter configuration
 * Ensures offer has enough information for meaningful filtering
 */
export function canFilterByOffer(offer: Pick<OfferCandidate, 'brand_norm' | 'model_norm'>): boolean {
  return Boolean(offer.brand_norm || offer.model_norm);
}

/**
 * Determine if post-filtering should be strict (both brand+model required)
 * vs lenient (model-only is acceptable)
 */
export function shouldUseStrictFiltering(
  offer: Pick<OfferCandidate, 'brand_norm' | 'model_norm'>,
  query: string
): boolean {
  // Use strict filtering when:
  // 1. We have both brand and model
  // 2. Query seems specific enough (contains model-like pattern)
  const queryNorm = normalizeText(query);
  const hasModelPattern = /\b[a-z]+\d+\b/.test(queryNorm);
  
  return Boolean(offer.brand_norm && offer.model_norm && hasModelPattern);
}

/**
 * Log post-filter results for telemetry
 * Helps debug when filtering is too strict or too lenient
 */
export function logFilterResult(
  query: string,
  offer: Pick<OfferCandidate, 'brand_norm' | 'model_norm'>,
  result: FilterResult
): void {
  // Non-blocking telemetry logging
  setImmediate(() => {
    console.log('Post-filter result:', {
      query: query.substring(0, 50),
      brand_norm: offer.brand_norm,
      model_norm: offer.model_norm,
      original_chunks: result.originalCount,
      filtered_chunks: result.filtered.length,
      filter_method: result.method,
      used_fallback: result.fallback,
      filter_success: result.filtered.length > 0
    });
  });
}