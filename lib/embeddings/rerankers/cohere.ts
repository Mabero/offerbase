import { Reranker, Document, RankedDocument, RerankingError } from '../types';

export class CohereReranker implements Reranker {
  private apiKey: string;
  private model: string;
  private maxDocuments: number = 1000; // Cohere's limit
  
  constructor(apiKey?: string, model: string = 'rerank-english-v3.0') {
    this.apiKey = apiKey || process.env.COHERE_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Cohere API key is required');
    }
    
    this.model = model;
  }
  
  async rerank(query: string, documents: Document[]): Promise<RankedDocument[]> {
    if (documents.length === 0) {
      return [];
    }
    
    // Limit documents to Cohere's maximum
    const docsToRerank = documents.slice(0, this.maxDocuments);
    
    try {
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          query: query,
          documents: docsToRerank.map(doc => doc.content),
          top_n: docsToRerank.length, // Return all documents ranked
          return_documents: false, // We already have the documents
        }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Cohere API error: ${error.message || response.statusText}`);
      }
      
      const data = await response.json();
      
      // Map reranked results back to documents with scores
      const rankedDocuments: RankedDocument[] = data.results.map((result: any) => {
        const originalDoc = docsToRerank[result.index];
        return {
          ...originalDoc,
          relevanceScore: result.relevance_score,
          originalRank: result.index,
        };
      });
      
      // Sort by relevance score (highest first)
      rankedDocuments.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return rankedDocuments;
    } catch (error) {
      throw new RerankingError(
        `Failed to rerank documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'cohere',
        error
      );
    }
  }
  
  getModelName(): string {
    return this.model;
  }
  
  getProviderName(): string {
    return 'cohere';
  }
  
  /**
   * Rerank with options for more control
   */
  async rerankWithOptions(
    query: string,
    documents: Document[],
    options: {
      topN?: number;
      maxChunksPerDoc?: number;
    } = {}
  ): Promise<RankedDocument[]> {
    if (documents.length === 0) {
      return [];
    }
    
    const docsToRerank = documents.slice(0, this.maxDocuments);
    
    try {
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          query: query,
          documents: docsToRerank.map(doc => doc.content),
          top_n: options.topN || docsToRerank.length,
          max_chunks_per_doc: options.maxChunksPerDoc,
          return_documents: false,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Cohere API error: ${error.message || response.statusText}`);
      }
      
      const data = await response.json();
      
      // Only return top N documents if specified
      const resultsToReturn = options.topN 
        ? data.results.slice(0, options.topN)
        : data.results;
      
      const rankedDocuments: RankedDocument[] = resultsToReturn.map((result: any) => {
        const originalDoc = docsToRerank[result.index];
        return {
          ...originalDoc,
          relevanceScore: result.relevance_score,
          originalRank: result.index,
        };
      });
      
      return rankedDocuments;
    } catch (error) {
      throw new RerankingError(
        `Failed to rerank documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'cohere',
        error
      );
    }
  }
}