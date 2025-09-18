/**
 * Corpus Validator for term extraction
 * Validates terms against actual database content with IDF filtering
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { LRUCache } from 'lru-cache';

export interface ValidatedTerm {
  term: string;
  docCount: number;  // Changed from docFrequency to match new RPC
  kept: boolean;
  reason?: string;
}

export interface ValidationResult {
  kept: string[];
  dropped: ValidatedTerm[];
  validatedTerms: ValidatedTerm[];  // Added for ranking access
  telemetry: {
    cacheHits: number;
    dbQueries: number;
    totalTerms: number;
  };
}

export class CorpusValidator {
  private cache: LRUCache<string, ValidatedTerm>;

  constructor(private supabase: SupabaseClient) {
    const cacheSize = Number(process.env.CORPUS_CACHE_SIZE || 1000);
    const cacheTTL = Number(process.env.CORPUS_CACHE_TTL || 900000); // 15 minutes

    this.cache = new LRUCache({
      max: cacheSize,
      ttl: cacheTTL,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }

  /**
   * Validate terms against corpus content with IDF filtering
   * Returns terms that exist but aren't too common
   */
  async validateTerms(
    terms: string[], 
    siteId: string
  ): Promise<ValidationResult> {
    if (terms.length === 0) {
      return {
        kept: [],
        dropped: [],
        validatedTerms: [],
        telemetry: { cacheHits: 0, dbQueries: 0, totalTerms: 0 }
      };
    }

    let cacheHits = 0;
    let dbQueries = 0;
    const uncachedTerms: string[] = [];
    const validatedTerms: ValidatedTerm[] = [];

    // Check cache first
    for (const term of terms) {
      const cacheKey = `${siteId}:${term}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached !== undefined) {
        validatedTerms.push(cached);
        cacheHits++;
      } else {
        uncachedTerms.push(term);
      }
    }

    // Batch validate uncached terms
    if (uncachedTerms.length > 0) {
      dbQueries = 1; // Single batch query
      
      try {
        const { data, error } = await this.supabase.rpc('validate_search_terms', {
          p_terms: uncachedTerms,
          p_site_id: siteId
        });

        if (error) {
          console.error('Corpus validation error:', error);
          // Fallback: treat all uncached terms as invalid
          for (const term of uncachedTerms) {
            const result: ValidatedTerm = {
              term,
              docCount: 0,  // Changed from docFrequency
              kept: false,
              reason: 'validation_error'
            };
            validatedTerms.push(result);
            this.cache.set(`${siteId}:${term}`, result);
          }
        } else {
          // Process results from RPC
          const resultMap = new Map<string, ValidatedTerm>();
          
          for (const result of data || []) {
            const validatedTerm: ValidatedTerm = {
              term: result.term,
              docCount: result.doc_count || 0,  // Changed from doc_frequency
              kept: result.kept || false,
              reason: result.reason
            };
            
            resultMap.set(result.term, validatedTerm);
            validatedTerms.push(validatedTerm);
            
            // Cache result
            this.cache.set(`${siteId}:${result.term}`, validatedTerm);
          }

          // Handle terms not found in database
          for (const term of uncachedTerms) {
            if (!resultMap.has(term)) {
              const notFoundResult: ValidatedTerm = {
                term,
                docCount: 0,  // Changed from docFrequency
                kept: false,
                reason: 'not_found'
              };
              validatedTerms.push(notFoundResult);
              this.cache.set(`${siteId}:${term}`, notFoundResult);
            }
          }
        }
      } catch (error) {
        console.error('Corpus validation RPC error:', error);
        // Fallback: treat all uncached terms as invalid
        for (const term of uncachedTerms) {
          const result: ValidatedTerm = {
            term,
            docCount: 0,  // Changed from docFrequency
            kept: false,
            reason: 'rpc_error'
          };
          validatedTerms.push(result);
          this.cache.set(`${siteId}:${term}`, result);
        }
      }
    }

    // Separate kept and dropped terms
    const kept = validatedTerms.filter(t => t.kept).map(t => t.term);
    const dropped = validatedTerms.filter(t => !t.kept);

    return {
      kept,
      dropped,
      validatedTerms,
      telemetry: {
        cacheHits,
        dbQueries,
        totalTerms: terms.length
      }
    };
  }

  /**
   * Clear cache for testing or manual refresh
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    size: number;
    max: number;
    ttl: number;
  } {
    return {
      size: this.cache.size,
      max: this.cache.max,
      ttl: this.cache.ttl || 0
    };
  }
}