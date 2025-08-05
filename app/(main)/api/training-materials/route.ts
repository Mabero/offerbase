import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { trainingMaterialCreateSchema, siteIdQuerySchema, sanitizeUrl } from '@/lib/validation';
import { scrapeUrl } from '@/lib/scraping';
import { analyzeContentIntelligence } from '@/lib/ai/content-intelligence';
import { scrapingCircuitBreaker, createScrapingFallback } from '@/lib/circuit-breaker';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

// GET /api/training-materials - Fetch training materials for a site
export const GET = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    querySchema: siteIdQuerySchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { siteId, supabase } = context;
    
    // Fetch training materials with retry logic
    const materials = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('training_materials')
          .select('id, url, title, content, content_type, metadata, scrape_status, last_scraped_at, error_message, created_at, updated_at')
          .eq('site_id', siteId!)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      { operation: 'fetchTrainingMaterials', siteId, userId: context.userId }
    );

    return createSuccessResponse(materials, 'Training materials fetched successfully');
  }
);

// POST /api/training-materials - Create new training material
export const POST = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    bodySchema: trainingMaterialCreateSchema,
    allowedMethods: ['POST'],
    rateLimitType: 'api' // Higher rate limits for scraping operations
  },
  async (context) => {
    const { body, siteId, supabase } = context;
    const materialData = body as typeof trainingMaterialCreateSchema._type;

    // Sanitize URL
    const sanitizedUrl = sanitizeUrl(materialData.url);

    // Check if material with this URL already exists
    const existingCheck = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('training_materials')
          .select('id')
          .eq('site_id', siteId!)
          .eq('url', sanitizedUrl)
          .single();

        // If no error or "not found" error, continue
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      },
      { operation: 'checkExistingMaterial', siteId, userId: context.userId }
    );

    if (existingCheck) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Material with this URL already exists', 409);
    }

    // Extract title from URL if not provided
    let title = materialData.title || sanitizedUrl;
    if (!materialData.title) {
      try {
        const urlObj = new URL(sanitizedUrl);
        title = urlObj.hostname;
      } catch {
        title = sanitizedUrl;
      }
    }

    // Create initial material record
    const material = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('training_materials')
          .insert([{
            site_id: siteId!,
            url: sanitizedUrl,
            title: title.trim(),
            content_type: materialData.content_type || 'webpage',
            scrape_status: 'pending'
          }])
          .select('id, url, title, content_type, scrape_status, created_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'createTrainingMaterial', siteId, userId: context.userId }
    );

    // Start scraping process in background
    scrapeContentForMaterial(material.id, sanitizedUrl).catch(error => {
      console.error('Error triggering scrape:', error);
    });

    return createSuccessResponse(
      material, 
      'Training material created successfully. Scraping will begin shortly.', 
      201
    );
  }
);

// Function to scrape content for a training material with circuit breaker protection
async function scrapeContentForMaterial(materialId: string, url: string) {
  const supabase = createSupabaseAdminClient();
  
  try {
    // Update status to processing
    await executeDBOperation(
      async () => {
        const { error } = await supabase
          .from('training_materials')
          .update({ scrape_status: 'processing' })
          .eq('id', materialId);
        
        if (error) throw error;
      },
      { operation: 'updateMaterialStatus', materialId }
    );
    
    // Use circuit breaker for scraping operation
    const circuitResult = await scrapingCircuitBreaker.execute(
      async () => await scrapeUrl(url),
      createScrapingFallback(url)
    );
    
    if (circuitResult.success && circuitResult.data) {
      const scrapeResult = circuitResult.data;
      
      // Analyze content intelligence
      const title = scrapeResult.metadata?.title || url;
      const content = scrapeResult.content || '';
      const metadata = scrapeResult.metadata || {};
      
      const analysis = analyzeContentIntelligence(title, content, metadata);
      
      // Update training material with scraped content and intelligence analysis
      await executeDBOperation(
        async () => {
          const { error } = await supabase
            .from('training_materials')
            .update({
              content: scrapeResult.content,
              content_type: analysis.contentType,
              metadata: scrapeResult.metadata,
              structured_data: analysis.structuredData,
              intent_keywords: analysis.intentKeywords,
              primary_products: analysis.primaryProducts,
              confidence_score: analysis.confidenceScore,
              scrape_status: circuitResult.fallbackUsed ? 'partial' : 'success',
              last_scraped_at: new Date().toISOString(),
              title: title,
              error_message: circuitResult.fallbackUsed ? 'Used fallback due to scraping issues' : null
            })
            .eq('id', materialId);
          
          if (error) throw error;
        },
        { operation: 'updateMaterialWithContent', materialId }
      );
      
      const statusMessage = circuitResult.fallbackUsed ? 'fallback used' : 'success';
      console.log(`📄 Content scraping ${statusMessage} for material ${materialId}:`, {
        contentType: analysis.contentType,
        structuredDataFields: Object.keys(analysis.structuredData).length,
        intentKeywords: analysis.intentKeywords.length,
        primaryProducts: analysis.primaryProducts.length,
        confidenceScore: analysis.confidenceScore,
        circuitBreakerState: circuitResult.circuitState
      });
    } else {
      // Circuit breaker failed or scraping failed
      const errorMessage = circuitResult.error || 'Unknown scraping error';
      
      await executeDBOperation(
        async () => {
          const { error } = await supabase
            .from('training_materials')
            .update({
              scrape_status: 'failed',
              error_message: errorMessage
            })
            .eq('id', materialId);
          
          if (error) throw error;
        },
        { operation: 'updateMaterialWithError', materialId }
      );
      
      console.error(`❌ Content scraping failed for material ${materialId}. Circuit state: ${circuitResult.circuitState}`);
    }
    
  } catch (error) {
    console.error('Error in scrapeContentForMaterial:', error);
    
    // Final fallback - update with error
    await executeDBOperation(
      async () => {
        const { error: updateError } = await supabase
          .from('training_materials')
          .update({
            scrape_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', materialId);
        
        if (updateError) throw updateError;
      },
      { operation: 'updateMaterialWithFinalError', materialId }
    ).catch(finalError => {
      console.error('Failed to update material with error status:', finalError);
    });
  }
}

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();