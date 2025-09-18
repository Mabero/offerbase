import { EmbeddingProvider, Reranker } from './types';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { CohereReranker } from './rerankers/cohere';

export type EmbeddingProviderType = 'openai' | 'cohere';
export type RerankerType = 'cohere' | 'none';

export class EmbeddingProviderFactory {
  private static providers: Map<string, EmbeddingProvider> = new Map();
  
  /**
   * Create or get cached embedding provider
   */
  static create(
    provider: EmbeddingProviderType = 'openai',
    options?: {
      apiKey?: string;
      model?: string;
      useCache?: boolean;
    }
  ): EmbeddingProvider {
    const cacheKey = `${provider}-${options?.model || 'default'}`;
    
    // Return cached provider if exists and caching is enabled
    if (options?.useCache !== false && this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
    }
    
    let instance: EmbeddingProvider;
    
    switch (provider) {
      case 'openai':
        instance = new OpenAIEmbeddingProvider(
          options?.apiKey,
          options?.model || 'text-embedding-3-small'
        );
        break;
      
      case 'cohere':
        // Placeholder for future Cohere embedding provider
        throw new Error('Cohere embedding provider not yet implemented');
      
      default:
        throw new Error(`Unknown embedding provider: ${provider}`);
    }
    
    // Cache the provider instance
    if (options?.useCache !== false) {
      this.providers.set(cacheKey, instance);
    }
    
    return instance;
  }
  
  /**
   * Clear cached providers
   */
  static clearCache(): void {
    this.providers.clear();
  }
  
  /**
   * Get provider from environment configuration
   */
  static fromEnvironment(): EmbeddingProvider {
    const provider = process.env.EMBEDDING_PROVIDER as EmbeddingProviderType || 'openai';
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    
    return this.create(provider, { model });
  }
}

export class RerankerFactory {
  private static rerankers: Map<string, Reranker> = new Map();
  
  /**
   * Create or get cached reranker
   */
  static create(
    type: RerankerType = 'cohere',
    options?: {
      apiKey?: string;
      model?: string;
      useCache?: boolean;
    }
  ): Reranker | null {
    if (type === 'none') {
      return null;
    }
    
    const cacheKey = `${type}-${options?.model || 'default'}`;
    
    // Return cached reranker if exists and caching is enabled
    if (options?.useCache !== false && this.rerankers.has(cacheKey)) {
      return this.rerankers.get(cacheKey)!;
    }
    
    let instance: Reranker;
    
    switch (type) {
      case 'cohere':
        instance = new CohereReranker(
          options?.apiKey,
          options?.model
        );
        break;
      
      default:
        throw new Error(`Unknown reranker type: ${type}`);
    }
    
    // Cache the reranker instance
    if (options?.useCache !== false) {
      this.rerankers.set(cacheKey, instance);
    }
    
    return instance;
  }
  
  /**
   * Clear cached rerankers
   */
  static clearCache(): void {
    this.rerankers.clear();
  }
  
  /**
   * Get reranker from environment configuration
   */
  static fromEnvironment(): Reranker | null {
    const enabled = process.env.RERANKER_ENABLED === 'true';
    if (!enabled) {
      return null;
    }

    // Require API key to avoid construction errors in production
    if (!process.env.COHERE_API_KEY) {
      console.warn('[RerankerFactory] RERANKER_ENABLED=true but COHERE_API_KEY is missing. Disabling reranker.');
      return null;
    }

    const model = process.env.COHERE_RERANK_MODEL || 'rerank-english-v3.0';
    try {
      return this.create('cohere', { model });
    } catch (err) {
      console.error('[RerankerFactory] Failed to initialize reranker:', err instanceof Error ? err.message : err);
      return null;
    }
  }
}
