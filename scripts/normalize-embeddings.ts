#!/usr/bin/env tsx
/**
 * Migration script to re-embed training materials with text normalization
 * This ensures all existing chunks use the same normalization as new queries
 */

import { createClient } from '@supabase/supabase-js';
import { ContentProcessor } from '../lib/embeddings/processor';
import { EmbeddingProviderFactory } from '../lib/embeddings/factory';

interface MigrationStats {
  totalMaterials: number;
  processedMaterials: number;
  failedMaterials: number;
  totalChunks: number;
  skippedMaterials: number;
}

class EmbeddingNormalizationMigration {
  private supabase;
  private processor: ContentProcessor;
  
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.processor = new ContentProcessor(
      EmbeddingProviderFactory.fromEnvironment()
    );
  }
  
  /**
   * Run the migration for a specific site
   */
  async migrate(siteId: string, options: {
    dryRun?: boolean;
    batchSize?: number;
    forceReprocess?: boolean;
  } = {}): Promise<MigrationStats> {
    const { dryRun = false, batchSize = 5, forceReprocess = false } = options;
    
    console.log(`Starting embedding normalization migration for site: ${siteId}`);
    console.log(`Options: dryRun=${dryRun}, batchSize=${batchSize}, forceReprocess=${forceReprocess}`);
    
    const stats: MigrationStats = {
      totalMaterials: 0,
      processedMaterials: 0,
      failedMaterials: 0,
      totalChunks: 0,
      skippedMaterials: 0,
    };
    
    try {
      // Get all training materials for the site
      const materialsQuery = this.supabase
        .from('training_materials')
        .select('id, title, embedding_model, embedding_created_at, chunk_count')
        .eq('site_id', siteId)
        .eq('scrape_status', 'success');
      
      if (!forceReprocess) {
        // Only process materials that haven't been normalized yet
        // We'll use embedding_model to track if normalization was applied
        materialsQuery.or('embedding_model.is.null,embedding_model.neq.text-embedding-3-small-normalized');
      }
      
      const { data: materials, error } = await materialsQuery;
      
      if (error) {
        throw new Error(`Failed to fetch materials: ${error.message}`);
      }
      
      if (!materials || materials.length === 0) {
        console.log('No materials found to process');
        return stats;
      }
      
      stats.totalMaterials = materials.length;
      console.log(`Found ${materials.length} materials to process`);
      
      if (dryRun) {
        console.log('DRY RUN - would process the following materials:');
        materials.forEach(m => {
          console.log(`  - ${m.title} (${m.chunk_count || 0} chunks)`);
        });
        return stats;
      }
      
      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < materials.length; i += batchSize) {
        const batch = materials.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(materials.length / batchSize)}`);
        
        const batchPromises = batch.map(async (material) => {
          try {
            console.log(`  Processing: ${material.title}`);
            
            const result = await this.processor.processTrainingMaterial(material.id);
            
            if (result.status === 'completed') {
              stats.processedMaterials++;
              stats.totalChunks += result.chunksProcessed;
              
              // Mark as normalized by updating the embedding model name
              await this.supabase
                .from('training_materials')
                .update({
                  embedding_model: 'text-embedding-3-small-normalized',
                  embedding_created_at: new Date().toISOString(),
                })
                .eq('id', material.id);
                
              console.log(`  ✓ Processed ${material.title} (${result.chunksProcessed} chunks)`);
            } else {
              stats.failedMaterials++;
              console.error(`  ✗ Failed to process ${material.title}: ${result.error}`);
            }
          } catch (error) {
            stats.failedMaterials++;
            console.error(`  ✗ Error processing ${material.title}:`, error);
          }
        });
        
        await Promise.all(batchPromises);
        
        // Small delay between batches to avoid rate limits
        if (i + batchSize < materials.length) {
          console.log('  Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log('Migration completed!');
      console.log('Stats:', stats);
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
    
    return stats;
  }
  
  /**
   * Migrate all sites
   */
  async migrateAll(options: {
    dryRun?: boolean;
    batchSize?: number;
    forceReprocess?: boolean;
  } = {}): Promise<Map<string, MigrationStats>> {
    console.log('Starting migration for all sites');
    
    // Get all sites
    const { data: sites, error } = await this.supabase
      .from('sites')
      .select('id, name');
    
    if (error) {
      throw new Error(`Failed to fetch sites: ${error.message}`);
    }
    
    if (!sites || sites.length === 0) {
      console.log('No sites found');
      return new Map();
    }
    
    const results = new Map<string, MigrationStats>();
    
    for (const site of sites) {
      console.log(`\\n=== Processing site: ${site.name} (${site.id}) ===`);
      try {
        const stats = await this.migrate(site.id, options);
        results.set(site.id, stats);
      } catch (error) {
        console.error(`Failed to migrate site ${site.name}:`, error);
        results.set(site.id, {
          totalMaterials: 0,
          processedMaterials: 0,
          failedMaterials: 1,
          totalChunks: 0,
          skippedMaterials: 0,
        });
      }
    }
    
    // Print summary
    console.log('\\n=== MIGRATION SUMMARY ===');
    let totalStats = {
      totalMaterials: 0,
      processedMaterials: 0,
      failedMaterials: 0,
      totalChunks: 0,
      skippedMaterials: 0,
    };
    
    results.forEach((stats, siteId) => {
      console.log(`Site ${siteId}: ${stats.processedMaterials}/${stats.totalMaterials} materials, ${stats.totalChunks} chunks`);
      totalStats.totalMaterials += stats.totalMaterials;
      totalStats.processedMaterials += stats.processedMaterials;
      totalStats.failedMaterials += stats.failedMaterials;
      totalStats.totalChunks += stats.totalChunks;
      totalStats.skippedMaterials += stats.skippedMaterials;
    });
    
    console.log('Total:', totalStats);
    
    return results;
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  const migration = new EmbeddingNormalizationMigration();
  
  const options = {
    dryRun: args.includes('--dry-run'),
    batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '5'),
    forceReprocess: args.includes('--force'),
  };
  
  const siteIdArg = args.find(arg => arg.startsWith('--site-id='));
  
  if (siteIdArg) {
    const siteId = siteIdArg.split('=')[1];
    await migration.migrate(siteId, options);
  } else {
    await migration.migrateAll(options);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { EmbeddingNormalizationMigration };