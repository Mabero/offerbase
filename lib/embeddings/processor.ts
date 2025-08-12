import { createClient } from '@supabase/supabase-js';
import { EmbeddingProvider, ProcessingStatus } from './types';
import { TextChunker, Chunk } from './chunker';
import { EmbeddingProviderFactory } from './factory';

export class ContentProcessor {
  private supabase;
  private provider: EmbeddingProvider;
  private chunker: TextChunker;
  
  constructor(provider?: EmbeddingProvider) {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.provider = provider || EmbeddingProviderFactory.fromEnvironment();
    this.chunker = new TextChunker({
      chunkSize: parseInt(process.env.CHUNK_SIZE_TOKENS || '512'),
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP_TOKENS || '128'),
    });
  }
  
  /**
   * Process a training material and generate embeddings
   */
  async processTrainingMaterial(materialId: string): Promise<ProcessingStatus> {
    const status: ProcessingStatus = {
      materialId,
      status: 'processing',
      chunksProcessed: 0,
      totalChunks: 0,
      startedAt: new Date(),
    };
    
    try {
      // Fetch the training material
      const { data: material, error: fetchError } = await this.supabase
        .from('training_materials')
        .select('*')
        .eq('id', materialId)
        .single();
      
      if (fetchError || !material) {
        throw new Error(`Failed to fetch training material: ${fetchError?.message}`);
      }
      
      if (!material.content) {
        throw new Error('Training material has no content');
      }
      
      // Delete existing chunks for this material
      await this.deleteExistingChunks(materialId);
      
      // Create chunks from content
      const chunks = this.chunker.chunk(material.content);
      status.totalChunks = chunks.length;
      
      // Generate embeddings for each chunk
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await this.provider.generateBatchEmbeddings(chunkTexts);
      
      // Prepare chunk records for insertion (simplified - no JSONB for now)
      const chunkRecords = chunks.map((chunk, index) => {
        const embeddingArray = embeddings[index];
        
        return {
          training_material_id: materialId,
          chunk_index: chunk.index,
          content: chunk.content,
          embedding: `[${embeddingArray.join(',')}]`, // PostgreSQL vector format
          embedding_model: this.provider.getModelName(),
          embedding_dimension: this.provider.getDimension(),
          metadata: {
            ...chunk.metadata,
            materialTitle: material.title,
            materialUrl: material.url,
          }
        };
      });
      
      // Insert chunks with embeddings
      const { error: insertError } = await this.supabase
        .from('training_material_chunks')
        .insert(chunkRecords);
      
      if (insertError) {
        throw new Error(`Failed to insert chunks: ${insertError.message}`);
      }
      
      // Update parent material with embedding metadata
      const { error: updateError } = await this.supabase
        .from('training_materials')
        .update({
          embedding_model: this.provider.getModelName(),
          embedding_created_at: new Date().toISOString(),
          chunk_count: chunks.length,
        })
        .eq('id', materialId);
      
      if (updateError) {
        throw new Error(`Failed to update material: ${updateError.message}`);
      }
      
      status.status = 'completed';
      status.chunksProcessed = chunks.length;
      status.completedAt = new Date();
      
      return status;
    } catch (error) {
      status.status = 'failed';
      status.error = error instanceof Error ? error.message : 'Unknown error';
      status.completedAt = new Date();
      
      // Update material with error status
      await this.supabase
        .from('training_materials')
        .update({
          scrape_status: 'failed',
          error_message: status.error,
        })
        .eq('id', materialId);
      
      throw error;
    }
  }
  
  /**
   * Process multiple materials in batch
   */
  async processBatch(materialIds: string[]): Promise<ProcessingStatus[]> {
    const results: ProcessingStatus[] = [];
    
    for (const materialId of materialIds) {
      try {
        const status = await this.processTrainingMaterial(materialId);
        results.push(status);
        
        // Small delay between materials to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          materialId,
          status: 'failed',
          chunksProcessed: 0,
          totalChunks: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return results;
  }
  
  /**
   * Process all materials for a site
   */
  async processSiteMaterials(siteId: string): Promise<ProcessingStatus[]> {
    // Fetch all materials for the site
    const { data: materials, error } = await this.supabase
      .from('training_materials')
      .select('id')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success')
      .is('embedding_created_at', null);
    
    if (error || !materials) {
      throw new Error(`Failed to fetch materials: ${error?.message}`);
    }
    
    const materialIds = materials.map(m => m.id);
    return this.processBatch(materialIds);
  }
  
  /**
   * Re-process materials with a different model
   */
  async reprocessWithModel(
    siteId: string,
    newProvider: EmbeddingProvider
  ): Promise<ProcessingStatus[]> {
    // Switch to new provider
    this.provider = newProvider;
    
    // Fetch all materials for the site
    const { data: materials, error } = await this.supabase
      .from('training_materials')
      .select('id')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success');
    
    if (error || !materials) {
      throw new Error(`Failed to fetch materials: ${error?.message}`);
    }
    
    const materialIds = materials.map(m => m.id);
    return this.processBatch(materialIds);
  }
  
  /**
   * Delete existing chunks for a material
   */
  private async deleteExistingChunks(materialId: string): Promise<void> {
    const { error } = await this.supabase
      .from('training_material_chunks')
      .delete()
      .eq('training_material_id', materialId);
    
    if (error) {
      console.warn(`Failed to delete existing chunks: ${error.message}`);
    }
  }
  
  /**
   * Get processing statistics for a site
   */
  async getProcessingStats(siteId: string): Promise<{
    totalMaterials: number;
    processedMaterials: number;
    totalChunks: number;
    averageChunksPerMaterial: number;
    embeddingModel: string | null;
  }> {
    const { data: materials, error } = await this.supabase
      .from('training_materials')
      .select('id, chunk_count, embedding_model')
      .eq('site_id', siteId);
    
    if (error || !materials) {
      throw new Error(`Failed to fetch stats: ${error?.message}`);
    }
    
    const processedMaterials = materials.filter(m => m.chunk_count > 0);
    const totalChunks = processedMaterials.reduce((sum, m) => sum + (m.chunk_count || 0), 0);
    
    return {
      totalMaterials: materials.length,
      processedMaterials: processedMaterials.length,
      totalChunks,
      averageChunksPerMaterial: processedMaterials.length > 0
        ? totalChunks / processedMaterials.length
        : 0,
      embeddingModel: processedMaterials[0]?.embedding_model || null,
    };
  }
}