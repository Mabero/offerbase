import { createClient } from '@supabase/supabase-js';
import {
  EmbeddingProvider,
  Reranker,
  SearchResult,
  HybridSearchOptions,
  Document,
} from './types';
import { EmbeddingProviderFactory, RerankerFactory } from './factory';
import { TermExtractor, ExtractedTerms } from '../search/term-extractor';
import { CorpusValidator, ValidationResult } from '../search/corpus-validator';

export interface SearchTelemetry {
  extraction_method: 'unicode_extraction' | 'skip_non_latin' | null;
  extracted_terms_raw: string[];
  validated_terms_kept: string[];
  validated_terms_dropped: Array<{
    term: string;
    reason: string;
    frequency: number;
  }>;
  fts_query_built: string | null;
  keyword_path_ran: boolean;
  trigram_fallback_used: boolean;
  vector_suggest_threshold: number;
  keyword_veto_threshold: number;
  bigrams_included?: string[];  // Added for tracking phrase handling
  doc_counts?: Record<string, number>;  // Added for ranking insights
  cache_stats?: {
    hits: number;
    queries: number;
  };
}

export class VectorSearchService {
  private supabase;
  private embeddingProvider: EmbeddingProvider;
  private reranker: Reranker | null;
  private termExtractor: TermExtractor;
  private corpusValidator: CorpusValidator;
  
  constructor(
    embeddingProvider?: EmbeddingProvider,
    reranker?: Reranker | null
  ) {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.embeddingProvider = embeddingProvider || EmbeddingProviderFactory.fromEnvironment();
    this.reranker = reranker !== undefined ? reranker : RerankerFactory.fromEnvironment();
    this.termExtractor = new TermExtractor();
    this.corpusValidator = new CorpusValidator(this.supabase);
  }
  
  /**
   * Perform hybrid search combining vector and keyword search
   */
  async hybridSearch(
    query: string,
    siteId: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      vectorWeight = 0.7,
      limit = 10,
      similarityThreshold = 0.3,
      useReranker = true,
      includeMetadata = true,
    } = options;
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
      
      // Perform parallel searches
      const [vectorResults, keywordResults] = await Promise.all([
        this.vectorSearch(queryEmbedding, siteId, limit * 2),
        this.keywordSearch(query, siteId, limit * 2),
      ]);
      
      // Merge and deduplicate results
      const mergedResults = this.mergeSearchResults(
        vectorResults,
        keywordResults,
        vectorWeight
      );
      
      // Apply reranker if available and enabled
      let finalResults = mergedResults;
      if (useReranker && this.reranker && mergedResults.length > 0) {
        finalResults = await this.rerankResults(query, mergedResults);
      }
      
      // Filter by similarity threshold and limit
      return finalResults
        .filter(r => r.similarity > similarityThreshold)
        .slice(0, limit)
        .map(r => includeMetadata ? r : { ...r, metadata: {} });
    } catch (error) {
      console.error('Hybrid search error:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Pure vector similarity search
   */
  async vectorSearch(
    queryEmbedding: number[],
    siteId: string,
    limit: number
  ): Promise<SearchResult[]> {
    try {
      // Call the PostgreSQL function for vector search
      const { data, error } = await this.supabase.rpc('search_similar_chunks', {
        query_embedding: `[${queryEmbedding.join(',')}]`,
        site_id_param: siteId,
        match_limit: limit,
      });
      
      if (error) {
        throw new Error(`Vector search failed: ${error.message}`);
      }
      
      return (data || []).map((row: any) => ({
        chunkId: row.chunk_id,
        content: row.content,
        similarity: row.similarity,
        metadata: row.metadata || {},
        materialId: row.material_id,
        materialTitle: row.material_title,
      }));
    } catch (error) {
      console.error('Vector search error:', error);
      return [];
    }
  }
  
  /**
   * Full-text keyword search
   */
  async keywordSearch(
    query: string,
    siteId: string,
    limit: number
  ): Promise<SearchResult[]> {
    try {
      // ASSERT: Must use config='simple' for universal compatibility
      const FTS_CONFIG = 'simple';
      if (FTS_CONFIG !== 'simple') {
        throw new Error('FTS must use simple config for universal compatibility');
      }
      
      // Escape special characters in query
      const escapedQuery = query.replace(/['"\\]/g, '\\$&');
      
      // DEBUG: Log the FTS query execution
      console.log('[DEBUG] keywordSearch executing:', {
        originalQuery: query,
        escapedQuery: escapedQuery,
        siteId: siteId,
        limit: limit,
        ftsConfig: FTS_CONFIG
      });
      
      // Build the query step by step for debugging
      const supabaseQuery = this.supabase
        .from('training_material_chunks')
        .select(`
          id,
          content,
          metadata,
          training_material_id,
          training_materials!inner(
            id,
            title,
            site_id
          )
        `)
        .eq('training_materials.site_id', siteId)
        .eq('training_materials.is_active', true)
        .textSearch('content', escapedQuery, {
          type: 'websearch',
          config: FTS_CONFIG,
        })
        .limit(limit);

      console.log('[DEBUG] Supabase query URL:', supabaseQuery.toString());

      // Execute the query
      const { data, error } = await supabaseQuery;
      
      // DEBUG: Log the FTS query results
      console.log('[DEBUG] keywordSearch results:', {
        query: escapedQuery,
        error: error,
        resultCount: data?.length || 0,
        firstResult: data?.[0] ? {
          id: data[0].id,
          materialTitle: data[0].training_materials?.title || 'unknown',
          contentPreview: data[0].content?.substring(0, 100) || ''
        } : null
      });
      
      if (error) {
        console.error('Keyword search error:', error);
        return [];
      }
      
      return (data || []).map((row: any) => ({
        chunkId: row.id,
        content: row.content,
        similarity: 0.5, // Default similarity for keyword matches
        metadata: row.metadata || {},
        materialId: row.training_materials.id,
        materialTitle: row.training_materials.title,
      }));
    } catch (error) {
      console.error('Keyword search error:', error);
      return [];
    }
  }
  
  /**
   * Merge vector and keyword search results
   */
  private mergeSearchResults(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    vectorWeight: number
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();
    const keywordWeight = 1 - vectorWeight;
    
    // Add vector results with weighted scores
    for (const result of vectorResults) {
      resultMap.set(result.chunkId, {
        ...result,
        similarity: result.similarity * vectorWeight,
      });
    }
    
    // Merge keyword results
    for (const result of keywordResults) {
      const existing = resultMap.get(result.chunkId);
      if (existing) {
        // Combine scores if chunk appears in both searches
        existing.similarity = existing.similarity + (0.5 * keywordWeight);
      } else {
        // Add new result with weighted score
        resultMap.set(result.chunkId, {
          ...result,
          similarity: 0.5 * keywordWeight,
        });
      }
    }
    
    // Sort by combined similarity score
    return Array.from(resultMap.values())
      .sort((a, b) => b.similarity - a.similarity);
  }
  
  /**
   * Rerank results using Cohere
   */
  private async rerankResults(
    query: string,
    results: SearchResult[]
  ): Promise<SearchResult[]> {
    if (!this.reranker || results.length === 0) {
      return results;
    }
    
    try {
      // Convert to Document format for reranker
      const documents: Document[] = results.map(r => ({
        id: r.chunkId,
        content: r.content,
        metadata: r.metadata,
      }));
      
      // Rerank documents
      const rankedDocs = await this.reranker.rerank(query, documents);
      
      // Map back to SearchResult with rerank scores
      return rankedDocs.map(doc => {
        const original = results.find(r => r.chunkId === doc.id)!;
        return {
          ...original,
          rerankScore: doc.relevanceScore,
          // Combine original similarity with rerank score
          similarity: (original.similarity + doc.relevanceScore) / 2,
        };
      });
    } catch (error) {
      console.error('Reranking failed, returning original results:', error);
      return results;
    }
  }
  
  /**
   * Search with conversational context
   */
  async searchWithContext(
    query: string,
    conversationHistory: string[],
    siteId: string,
    options: HybridSearchOptions = {}
  ): Promise<SearchResult[]> {
    // Combine recent conversation for better context
    const context = [...conversationHistory.slice(-3), query].join(' ');
    
    // Use context-aware query for search
    return this.hybridSearch(context, siteId, {
      ...options,
      // Increase limit to get more candidates when using context
      limit: (options.limit || 10) * 2,
    }).then(results => 
      // Return top results after context-aware search
      results.slice(0, options.limit || 10)
    );
  }
  
  /**
   * Get similar chunks to a specific chunk
   */
  async findSimilarChunks(
    chunkId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      // Fetch the chunk and its embedding
      const { data: chunk, error } = await this.supabase
        .from('training_material_chunks')
        .select(`
          *,
          training_materials!inner(
            site_id
          )
        `)
        .eq('id', chunkId)
        .single();
      
      if (error || !chunk || !chunk.embedding) {
        throw new Error('Chunk not found or has no embedding');
      }
      
      // Search for similar chunks in the same site
      return this.vectorSearch(
        chunk.embedding,
        chunk.training_materials.site_id,
        limit + 1 // +1 to exclude self
      ).then(results => 
        // Filter out the original chunk
        results.filter(r => r.chunkId !== chunkId).slice(0, limit)
      );
    } catch (error) {
      console.error('Find similar chunks error:', error);
      return [];
    }
  }

  /**
   * Smart Context Search with Normalized Scoring
   * Uses context terms for boosting without mutating the query
   */
  async searchWithSmartContext(
    query: string,
    siteId: string,
    context: {
      terms: string[];
      categoryHint?: string;
    },
    options: HybridSearchOptions = {}
  ): Promise<(SearchResult & {
    base_score: number;
    final_score: number;
    score_source: 'fts' | 'trgm';
    boosts_applied: {
      term_matches: string[];
      category_boost: number;
    };
  })[]> {
    try {
      // First, try regular hybrid search
      let rawResults = await this.hybridSearch(query, siteId, {
        ...options,
        limit: (options.limit || 10) * 2 // Get more candidates for boosting
      });

      // If no results and CJK/Thai detected, try trigram fallback
      const needsTrigram = this.detectMultilingualNeeds(query);
      if (rawResults.length === 0 && needsTrigram) {
        rawResults = await this.trigramSearch(query, siteId, options.limit || 10);
      }

      if (rawResults.length === 0) {
        return [];
      }

      // Apply normalized scoring with boosts
      return this.normalizeScoresWithBoosts(rawResults, context, needsTrigram);
    } catch (error) {
      console.error('Smart context search error:', error);
      // Fallback to regular hybrid search
      return this.hybridSearch(query, siteId, options).then(results => 
        results.map(r => ({
          ...r,
          base_score: 0.5,
          final_score: r.similarity,
          score_source: 'fts' as const,
          boosts_applied: { term_matches: [], category_boost: 0 }
        }))
      );
    }
  }

  /**
   * Detect if query needs trigram fallback (CJK/Thai scripts)
   */
  private detectMultilingualNeeds(query: string): boolean {
    const CJK_THAI = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
    return CJK_THAI.test(query);
  }

  /**
   * Trigram search fallback for CJK/Thai
   */
  private async trigramSearch(
    query: string,
    siteId: string,
    limit: number
  ): Promise<SearchResult[]> {
    try {
      const { data, error } = await this.supabase
        .from('training_material_chunks')
        .select(`
          id,
          content,
          metadata,
          training_material_id,
          training_materials!inner(
            id,
            title,
            site_id
          )
        `)
        .eq('training_materials.site_id', siteId)
        .eq('training_materials.is_active', true)
        // Use trigram similarity
        .filter('content', 'like', `%${query}%`)
        .limit(limit);

      if (error) {
        console.error('Trigram search error:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        chunkId: row.id,
        content: row.content,
        similarity: 0.5, // Default similarity for trigram
        metadata: row.metadata || {},
        materialId: row.training_material_id,
        materialTitle: row.training_materials.title,
      }));
    } catch (error) {
      console.error('Trigram search error:', error);
      return [];
    }
  }

  /**
   * Normalize scores to [0,1] and apply context boosts
   */
  private normalizeScoresWithBoosts(
    results: SearchResult[],
    context: { terms: string[]; categoryHint?: string },
    usedTrigram: boolean
  ) {
    // Weights must sum to 1.0 for proper normalization
    const WEIGHTS = { alias: 0.6, fts: 0.3, vector: 0.1 };
    const sum = WEIGHTS.alias + WEIGHTS.fts + WEIGHTS.vector;
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Score weights must sum to 1.0, got ${sum}`);
    }

    // Get boost configuration from environment
    const BOOST_CONTEXT_TERM = parseFloat(process.env.BOOST_CONTEXT_TERM || '0.1');
    const BOOST_CATEGORY = parseFloat(process.env.BOOST_CATEGORY || '0.15');
    const MAX_TOTAL_BOOST = parseFloat(process.env.MAX_TOTAL_BOOST || '0.25');

    // Find max FTS score for normalization
    const maxFts = Math.max(...results.map(r => r.similarity || 0)) || 1;

    return results.map(result => {
      // Normalize component scores to [0,1]
      const alias_norm = 0; // TODO: Add alias scoring
      const fts_norm = (result.similarity || 0) / maxFts;
      const vector_norm = result.similarity || 0; // Already 0-1 from cosine similarity

      // Calculate base score (must be [0,1])
      const base_score = 
        alias_norm * WEIGHTS.alias +
        fts_norm * WEIGHTS.fts +
        vector_norm * WEIGHTS.vector;

      // Calculate boosts
      const term_matches = context.terms.filter(term => 
        result.content.toLowerCase().includes(term.toLowerCase()) ||
        result.materialTitle.toLowerCase().includes(term.toLowerCase())
      );
      
      const term_boost = term_matches.length * BOOST_CONTEXT_TERM;
      const category_boost = 0; // TODO: Add category matching
      const total_boost = Math.min(term_boost + category_boost, MAX_TOTAL_BOOST);

      // Apply multiplicative boost
      const final_score = base_score * (1 + total_boost);
      
      // Clamp to [0, 1.25]
      const clamped_final = Math.max(0, Math.min(1.25, final_score));

      return {
        ...result,
        base_score,
        final_score: clamped_final,
        score_source: usedTrigram ? 'trgm' as const : 'fts' as const,
        boosts_applied: {
          term_matches,
          category_boost
        }
      };
    }).sort((a, b) => b.final_score - a.final_score);
  }

  /**
   * Enhanced hybrid search with corpus-aware term extraction
   * Feature-flagged behind CORPUS_AWARE_SEARCH environment variable
   */
  async hybridSearchWithTermExtraction(
    query: string,
    siteId: string,
    options: HybridSearchOptions = {}
  ): Promise<{ results: SearchResult[]; telemetry: SearchTelemetry }> {
    const telemetry: SearchTelemetry = {
      extraction_method: null,
      extracted_terms_raw: [],
      validated_terms_kept: [],
      validated_terms_dropped: [],
      fts_query_built: null,
      keyword_path_ran: false,
      trigram_fallback_used: false,
      vector_suggest_threshold: Number(process.env.VECTOR_SUGGEST_THRESHOLD || 0.25),
      keyword_veto_threshold: Number(process.env.KEYWORD_VETO_THRESHOLD || 0.03)
    };

    const limit = options.limit || 10;

    try {
      // 1. Extract terms from query
      const extracted = this.termExtractor.extractTerms(query);
      
      let ftsQuery: string | null = null;
      let keywordResults: SearchResult[] = [];

      if (!extracted) {
        // Non-Latin script detected - use trigram fallback
        telemetry.extraction_method = 'skip_non_latin';
        telemetry.trigram_fallback_used = true;
        
        // Use trigram search instead of FTS
        keywordResults = await this.trigramSearch(query, siteId, limit * 2);
      } else {
        // Latin script - use term extraction
        telemetry.extraction_method = 'unicode_extraction';
        telemetry.extracted_terms_raw = extracted.combined;
        
        // 2. Validate terms against corpus
        const validation = await this.corpusValidator.validateTerms(
          extracted.combined, 
          siteId
        );
        
        telemetry.validated_terms_kept = validation.kept;
        telemetry.validated_terms_dropped = validation.dropped.map(d => ({
          term: d.term,
          reason: d.reason || 'unknown',
          frequency: d.docCount  // Changed from docFrequency
        }));
        telemetry.cache_stats = {
          hits: validation.telemetry.cacheHits,
          queries: validation.telemetry.dbQueries
        };
        
        // 3. Rank and cap validated terms
        if (validation.kept.length > 0) {
          // Rank ALL kept terms, then cap to MAX_EXTRACT_TERMS
          const maxTerms = Number(process.env.MAX_EXTRACT_TERMS || 3);
          const rankedTerms = validation.kept
            .sort((a, b) => {
              // Get doc counts from validation data for ranking
              const aData = validation.validatedTerms.find(t => t.term === a);
              const bData = validation.validatedTerms.find(t => t.term === b);
              
              // Priority 1: Bigrams (contain space)
              const aIsBigram = a.includes(' ');
              const bIsBigram = b.includes(' ');
              if (aIsBigram !== bIsBigram) return aIsBigram ? -1 : 1;
              
              // Priority 2: Contains digits (product codes like g3, 15pro)
              const aHasDigit = /\d/.test(a);
              const bHasDigit = /\d/.test(b);
              if (aHasDigit !== bHasDigit) return aHasDigit ? -1 : 1;
              
              // Priority 3: Length (longer is more specific)
              if (a.length !== b.length) return b.length - a.length;
              
              // Priority 4: Lower doc_count (rarer terms are more specific)
              const aCount = aData?.docCount || 0;
              const bCount = bData?.docCount || 0;
              return aCount - bCount;
            })
            .slice(0, maxTerms); // Cap AFTER ranking to ensure we keep the best terms
          
          // Build FTS query from ranked terms
          ftsQuery = this.buildFTSQuery(rankedTerms);
          telemetry.fts_query_built = ftsQuery;
          telemetry.keyword_path_ran = true;
          telemetry.validated_terms_kept = rankedTerms; // Update with ranked terms
          
          // Add telemetry for ranking insights
          telemetry.bigrams_included = rankedTerms.filter(t => t.includes(' '));
          telemetry.doc_counts = Object.fromEntries(
            rankedTerms.map(term => [
              term, 
              validation.validatedTerms.find(t => t.term === term)?.docCount || 0
            ])
          );
          
          // Run FTS search with ranked terms
          keywordResults = await this.keywordSearch(ftsQuery, siteId, limit * 2);
        }
      }

      // 4. Always run vector search with original query
      const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
      const vectorResults = await this.vectorSearch(queryEmbedding, siteId, limit * 2);

      // 5. Merge results
      const mergedResults = this.mergeSearchResults(
        vectorResults,
        keywordResults,
        options.vectorWeight || 0.7
      );

      // 6. Apply reranker if available
      let finalResults = mergedResults;
      if (options.useReranker !== false && this.reranker && mergedResults.length > 0) {
        finalResults = await this.rerankResults(query, mergedResults);
      }

      // 7. Filter and limit
      const threshold = options.similarityThreshold || 0.3;
      const filteredResults = finalResults
        .filter(r => r.similarity > threshold)
        .slice(0, limit)
        .map(r => options.includeMetadata !== false ? r : { ...r, metadata: {} });

      return {
        results: filteredResults,
        telemetry
      };

    } catch (error) {
      console.error('Enhanced hybrid search error:', error);
      
      // Fallback to regular hybrid search
      const fallbackResults = await this.hybridSearch(query, siteId, options);
      
      return {
        results: fallbackResults,
        telemetry: {
          ...telemetry,
          extraction_method: 'fallback_error'
        }
      };
    }
  }

  /**
   * Build FTS query from validated terms
   * Quotes bigrams/phrases but not single tokens for flexibility
   */
  private buildFTSQuery(validatedTerms: string[]): string {
    return validatedTerms
      .map(term => {
        if (term.includes(' ')) {
          // Bigram/phrase - use quotes for exact matching
          return `"${term.replace(/"/g, '""')}"`;
        } else {
          // Single token - no quotes for flexibility
          return term.replace(/['"\\]/g, '\\$&');
        }
      })
      .join(' OR ');
  }

  /**
   * Trigram search for non-Latin scripts (CJK/Thai/Arabic/Hebrew)
   */
  private async trigramSearch(
    query: string,
    siteId: string,
    limit: number
  ): Promise<SearchResult[]> {
    try {
      const { data, error } = await this.supabase
        .from('training_material_chunks')
        .select(`
          id,
          content,
          metadata,
          training_material_id,
          training_materials!inner(
            id,
            title,
            site_id
          )
        `)
        .eq('training_materials.site_id', siteId)
        .eq('training_materials.is_active', true)
        .filter('content', 'like', `%${query}%`)
        .limit(limit);

      if (error) {
        console.error('Trigram search error:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        chunkId: row.id,
        content: row.content,
        similarity: 0.5, // Default similarity for trigram matches
        metadata: row.metadata || {},
        materialId: row.training_material_id,
        materialTitle: row.training_materials.title,
      }));
    } catch (error) {
      console.error('Trigram search error:', error);
      return [];
    }
  }
}