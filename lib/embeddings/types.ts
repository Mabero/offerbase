// Embedding provider types and interfaces

export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   */
  generateEmbedding(text: string): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * Get the dimension of embeddings produced by this provider
   */
  getDimension(): number;
  
  /**
   * Get the model name used by this provider
   */
  getModelName(): string;
  
  /**
   * Get maximum tokens this model can handle
   */
  getMaxTokens(): number;
  
  /**
   * Get the provider name
   */
  getProviderName(): string;
  
  /**
   * Get debug information for text normalization (optional)
   */
  getDebugInfo?(originalText: string): {
    original: string;
    normalized: string;
    hash: string;
    changed: boolean;
  };
}

export interface Reranker {
  /**
   * Rerank documents based on relevance to query
   */
  rerank(query: string, documents: Document[]): Promise<RankedDocument[]>;
  
  /**
   * Get the model name used by this reranker
   */
  getModelName(): string;
  
  /**
   * Get the provider name
   */
  getProviderName(): string;
}

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface RankedDocument extends Document {
  relevanceScore: number;
  originalRank?: number;
}

export interface SearchResult {
  chunkId: string;
  content: string;
  similarity: number; // Cosine similarity: 1 = identical, 0 = orthogonal, -1 = opposite
  metadata: Record<string, any>;
  materialId: string;
  materialTitle: string;
  rerankScore?: number; // Optional reranking score
}

export interface HybridSearchOptions {
  vectorWeight?: number; // Weight for vector search (0-1)
  limit?: number; // Number of results to return
  similarityThreshold?: number; // Minimum similarity score
  useReranker?: boolean; // Whether to use reranker
  includeMetadata?: boolean; // Include metadata in results
}

export interface ChunkingOptions {
  chunkSize?: number; // Size of chunks in tokens
  chunkOverlap?: number; // Overlap between chunks in tokens
  splitByParagraph?: boolean; // Split on paragraph boundaries
  respectSentences?: boolean; // Don't split mid-sentence
  minChunkSize?: number; // Minimum chunk size
  maxChunkSize?: number; // Maximum chunk size
}

export interface ProcessingStatus {
  materialId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunksProcessed: number;
  totalChunks: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface EmbeddingMetrics {
  provider: string;
  model: string;
  tokensProcessed: number;
  embeddingsGenerated: number;
  averageLatency: number;
  errors: number;
  timestamp: Date;
}

// Error types
export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}

export class RerankingError extends Error {
  constructor(
    message: string,
    public provider: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'RerankingError';
  }
}

export class ChunkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkingError';
  }
}