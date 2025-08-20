import { createClient } from '@supabase/supabase-js';
import {
  EmbeddingProvider,
  Reranker,
  SearchResult,
  HybridSearchOptions,
  Document,
} from './types';
import { EmbeddingProviderFactory, RerankerFactory } from './factory';

export class VectorSearchService {
  private supabase;
  private embeddingProvider: EmbeddingProvider;
  private reranker: Reranker | null;
  
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
      // Escape special characters in query
      const escapedQuery = query.replace(/['"\\]/g, '\\$&');
      
      // Direct SQL query for full-text search
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
        .textSearch('content', escapedQuery, {
          type: 'websearch',
          config: 'simple',
        })
        .limit(limit);
      
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
}