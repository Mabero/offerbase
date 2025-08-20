import { EmbeddingProvider, EmbeddingProviderError } from '../types';
import { defaultEmbeddingNormalizer, TextNormalizer } from '../text-normalizer';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimension: number;
  private maxTokens: number;
  private batchSize: number = 100; // OpenAI supports up to 2048 texts per request
  private normalizer: TextNormalizer;
  
  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.model = model;
    this.normalizer = defaultEmbeddingNormalizer;
    
    // Set dimensions based on model
    switch (model) {
      case 'text-embedding-3-small':
        this.dimension = 1536;
        this.maxTokens = 8191;
        break;
      case 'text-embedding-3-large':
        this.dimension = 3072;
        this.maxTokens = 8191;
        break;
      case 'text-embedding-ada-002':
        this.dimension = 1536;
        this.maxTokens = 8191;
        break;
      default:
        throw new Error(`Unknown OpenAI embedding model: ${model}`);
    }
  }
  
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Normalize text for consistent embedding generation
      const normalizedText = this.normalizer.normalize(text);
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: normalizedText,
          encoding_format: 'float',
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      throw new EmbeddingProviderError(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'openai',
        error
      );
    }
  }
  
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    
    const embeddings: number[][] = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      
      // Normalize all texts in the batch
      const normalizedBatch = batch.map(text => this.normalizer.normalize(text));
      
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            input: normalizedBatch,
            encoding_format: 'float',
          }),
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }
        
        const data = await response.json();
        const batchEmbeddings = data.data
          .sort((a: any, b: any) => a.index - b.index)
          .map((item: any) => item.embedding);
        
        embeddings.push(...batchEmbeddings);
        
        // Rate limiting: wait 100ms between batches to avoid hitting rate limits
        if (i + this.batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        throw new EmbeddingProviderError(
          `Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'openai',
          error
        );
      }
    }
    
    return embeddings;
  }
  
  getDimension(): number {
    return this.dimension;
  }
  
  getModelName(): string {
    return this.model;
  }
  
  getMaxTokens(): number {
    return this.maxTokens;
  }
  
  getProviderName(): string {
    return 'openai';
  }
  
  /**
   * Estimate token count for a text (rough approximation)
   * OpenAI uses tiktoken, but for simplicity we'll use a rough estimate
   */
  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Check if text exceeds token limit
   */
  exceedsTokenLimit(text: string): boolean {
    return this.estimateTokens(text) > this.maxTokens;
  }
  
  /**
   * Get debug information for text normalization
   */
  getDebugInfo(originalText: string): {
    original: string;
    normalized: string;
    hash: string;
    changed: boolean;
  } {
    const normalized = this.normalizer.normalize(originalText);
    return {
      original: originalText,
      normalized,
      hash: this.normalizer.getDebugHash(originalText),
      changed: originalText !== normalized,
    };
  }
}