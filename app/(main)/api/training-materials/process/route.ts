import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeUrl } from '@/lib/scraping';
import { summarizeTrainingMaterial } from '@/lib/ai/summarizer';
import { z } from 'zod';

// Input validation schema
const processRequestSchema = z.object({
  materialId: z.string().uuid('Invalid material ID format'),
  retryCount: z.number().min(0).max(3).default(0)
});

// Helper function to get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper function to create response
function createResponse(data: unknown, message?: string, status: number = 200) {
  return NextResponse.json({
    success: status < 400,
    data,
    message,
    timestamp: new Date().toISOString()
  }, { 
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

// POST /api/training-materials/process - Background processing endpoint
export async function POST(request: NextRequest) {
  const processingStartTime = Date.now();
  
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createResponse({ error: 'Authentication required' }, 'Unauthorized', 401);
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return createResponse({ error: 'Invalid JSON in request body' }, 'Bad Request', 400);
    }

    const validation = processRequestSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ');
      return createResponse({ error: errorMessage }, 'Validation Failed', 400);
    }

    const { materialId, retryCount } = validation.data;
    console.log(`🔄 Processing training material: ${materialId} (retry: ${retryCount})`);

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Get the training material and verify ownership
    const { data: material, error: materialError } = await supabase
      .from('training_materials')
      .select(`
        id, url, title, site_id, scrape_status, error_message,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', materialId)
      .eq('sites.user_id', userId)
      .single();

    if (materialError || !material) {
      console.error('❌ Material ownership verification failed:', materialError);
      return createResponse({ error: 'Training material not found or unauthorized' }, 'Not Found', 404);
    }

    // Check if already processed
    if (material.scrape_status === 'success') {
      console.log('✅ Material already processed successfully');
      return createResponse({ 
        materialId,
        status: 'already_processed',
        message: 'Material already scraped successfully' 
      });
    }

    // Update status to processing
    console.log('🔄 Updating status to processing...');
    const { error: statusError } = await supabase
      .from('training_materials')
      .update({ 
        scrape_status: 'processing',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', materialId);

    if (statusError) {
      console.error('❌ Failed to update status to processing:', statusError);
      return createResponse({ error: 'Failed to update processing status' }, 'Internal Error', 500);
    }

    // Perform the scraping
    console.log(`🌐 Scraping URL: ${material.url}`);
    const scrapeResult = await scrapeUrl(material.url, {
      timeout: 30000 // 30 second timeout
    });

    if (!scrapeResult.success) {
      console.error('❌ Scraping failed:', scrapeResult.error);
      
      // Check if we should retry
      if (retryCount < 3) {
        console.log(`🔄 Scheduling retry ${retryCount + 1}/3...`);
        
        // Update status back to pending for retry
        await supabase
          .from('training_materials')
          .update({ 
            scrape_status: 'pending',
            error_message: `Retry ${retryCount + 1}/3: ${scrapeResult.error}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', materialId);

        // Schedule retry (non-blocking)
        setTimeout(async () => {
          try {
            await fetch(request.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ materialId, retryCount: retryCount + 1 })
            });
          } catch (error) {
            console.error('❌ Retry scheduling failed:', error);
          }
        }, (retryCount + 1) * 5000); // Exponential backoff: 5s, 10s, 15s

        return createResponse({
          materialId,
          status: 'retry_scheduled',
          retryCount: retryCount + 1,
          message: `Scraping failed, retry ${retryCount + 1}/3 scheduled`
        });
      } else {
        // Mark as failed after max retries
        await supabase
          .from('training_materials')
          .update({ 
            scrape_status: 'failed',
            error_message: `Failed after ${retryCount} retries: ${scrapeResult.error}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', materialId);

        return createResponse({
          materialId,
          status: 'failed',
          error: scrapeResult.error,
          message: 'Scraping failed after maximum retries'
        }, 'Scraping Failed', 422);
      }
    }

    console.log(`✅ Scraping successful! Content length: ${scrapeResult.content?.length}`);

    // Prepare the update data
    const updateData: Record<string, unknown> = {
      content: scrapeResult.content,
      content_type: scrapeResult.contentType || 'webpage',
      metadata: scrapeResult.metadata || {},
      scrape_status: 'success',
      last_scraped_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString()
    };

    // Update the title if we got better metadata
    if (scrapeResult.metadata?.title && scrapeResult.metadata.title.length > 0) {
      updateData.title = scrapeResult.metadata.title;
    }

    // Try to generate AI summary (non-blocking failure)
    try {
      console.log('🤖 Generating AI summary...');
      const summaryResult = await summarizeTrainingMaterial(
        scrapeResult.content!,
        material.title,
        scrapeResult.metadata
      );

      // Store AI analysis results
      updateData.summary = summaryResult.summary;
      updateData.key_points = summaryResult.keyPoints;
      updateData.intent_keywords = summaryResult.intentKeywords;
      updateData.primary_products = summaryResult.primaryProducts;
      updateData.confidence_score = summaryResult.confidenceScore;
      
      // Merge structured data
      if (summaryResult.structuredData && Object.keys(summaryResult.structuredData).length > 0) {
        updateData.structured_data = summaryResult.structuredData;
      }

      console.log('✅ AI summary generated successfully');
    } catch (summaryError) {
      console.warn('⚠️ AI summary generation failed (non-critical):', summaryError);
      // Continue without summary - not critical for success
    }

    // Update the training material with all scraped data
    const { data: updatedMaterial, error: updateError } = await supabase
      .from('training_materials')
      .update(updateData)
      .eq('id', materialId)
      .select('id, url, title, content_type, scrape_status, last_scraped_at, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('❌ Failed to update material with scraped content:', updateError);
      
      // Mark as failed
      await supabase
        .from('training_materials')
        .update({ 
          scrape_status: 'failed',
          error_message: `Database update failed: ${updateError.message}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);

      return createResponse({ error: 'Failed to save scraped content' }, 'Database Error', 500);
    }

    const processingDuration = Date.now() - processingStartTime;
    console.log(`🎉 Training material processed successfully in ${processingDuration}ms`);

    return createResponse({
      material: updatedMaterial,
      processingTime: processingDuration,
      contentLength: scrapeResult.content?.length || 0,
      contentType: scrapeResult.contentType,
      hasSummary: !!updateData.summary
    }, 'Training material processed successfully');

  } catch (error) {
    console.error('❌ Background processing error:', error);
    
    // Try to mark material as failed in database
    try {
      const { materialId } = processRequestSchema.parse(await request.json());
      const supabase = getSupabaseClient();
      
      await supabase
        .from('training_materials')
        .update({ 
          scrape_status: 'failed',
          error_message: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);
    } catch {
      // If this fails, we'll just log the original error
    }

    return createResponse(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' }, 
      'Internal Server Error', 
      500
    );
  }
}

// OPTIONS /api/training-materials/process - CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
}