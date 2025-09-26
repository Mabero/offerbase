import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeUrl } from '@/lib/scraping';
import { invalidateSiteDomainTerms } from '@/lib/ai/domain-guard';
import { summarizeTrainingMaterial } from '@/lib/ai/summarizer';

// GET /api/training-materials - Fetch training materials for a site
export async function GET(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get siteId from query params
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Fetch training materials
    const { data, error } = await supabase
      .from('training_materials')
      .select('id, url, title, content, content_type, metadata, scrape_status, last_scraped_at, error_message, created_at, updated_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Training materials query error:', error);
      return NextResponse.json({ error: 'Failed to fetch training materials', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });

  } catch (error) {
    console.error('Training materials API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// POST /api/training-materials - Create new training material
export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { siteId, url, title, content_type } = body;
    
    if (!siteId || !url) {
      return NextResponse.json({ error: 'siteId and url are required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Check if material with this URL already exists
    const { data: existingMaterial, error: checkError } = await supabase
      .from('training_materials')
      .select('id')
      .eq('site_id', siteId)
      .eq('url', url.trim())
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Material check error:', checkError);
      return NextResponse.json({ error: 'Failed to check existing materials', details: checkError }, { status: 500 });
    }

    if (existingMaterial) {
      return NextResponse.json({ error: 'Material with this URL already exists' }, { status: 409 });
    }

    // Extract title from URL if not provided
    let materialTitle = title || url.trim();
    if (!title) {
      try {
        const urlObj = new URL(url.trim());
        materialTitle = urlObj.hostname;
      } catch {
        materialTitle = url.trim();
      }
    }

    // Create training material
    const { data, error } = await supabase
      .from('training_materials')
      .insert([{
        site_id: siteId,
        url: url.trim(),
        title: materialTitle.trim(),
        content_type: content_type || 'webpage',
        scrape_status: 'pending'
      }])
      .select('id, url, title, content_type, scrape_status, created_at')
      .single();

    if (error) {
      console.error('Training material creation error:', error);
      return NextResponse.json({ error: 'Failed to create training material', details: error }, { status: 500 });
    }

    console.log(`✅ Training material created: ${data.id}`);

    // Start scraping process in background (direct function call - MUCH simpler!)
    scrapeContentForMaterial(data.id, url.trim()).catch(error => {
      console.error('❌ Background scraping error:', error);
    });

    return NextResponse.json({ 
      success: true, 
      data,
      message: 'Training material created successfully. Scraping will begin shortly.'
    }, { status: 201 });

  } catch (error) {
    console.error('Training materials API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// Helper function to handle background scraping (direct approach - simpler and more reliable)
async function scrapeContentForMaterial(materialId: string, url: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    console.log(`🔄 Starting scraping for material: ${materialId}`);
    
    // Update status to processing
    await supabase
      .from('training_materials')
      .update({ 
        scrape_status: 'processing',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', materialId);

    // Perform the scraping
    const scrapeResult = await scrapeUrl(url, { timeout: 30000 });
    
    if (!scrapeResult.success) {
      console.error('❌ Scraping failed:', scrapeResult.error);
      
      // Mark as failed
      await supabase
        .from('training_materials')
        .update({ 
          scrape_status: 'failed',
          error_message: scrapeResult.error,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);
      return;
    }

    console.log(`✅ Scraping successful! Content length: ${scrapeResult.content?.length}`);

    // Prepare update data
    const updateData: Record<string, unknown> = {
      content: scrapeResult.content,
      content_type: scrapeResult.contentType || 'webpage',
      metadata: scrapeResult.metadata || {},
      scrape_status: 'success',
      last_scraped_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString()
    };

    // Update title if we got better metadata
    if (scrapeResult.metadata?.title && scrapeResult.metadata.title.length > 0) {
      updateData.title = scrapeResult.metadata.title;
    }

    // Fetch site_id for invalidation
    const { data: matForSite } = await supabase
      .from('training_materials')
      .select('site_id')
      .eq('id', materialId)
      .single();

    // Update the training material
    await supabase
      .from('training_materials')
      .update(updateData)
      .eq('id', materialId);

    console.log(`🎉 Training material ${materialId} processed successfully`);

    // Summarize with LLM to extract subjects/brands/models using scraped content
    try {
      console.log(`🤖 Summarizing training material for subjects: ${materialId}`);
      const effectiveTitle = (typeof updateData.title === 'string' && updateData.title)
        ? String(updateData.title)
        : (scrapeResult.metadata?.title || url);
      const summaryResult = await summarizeTrainingMaterial(
        scrapeResult.content || '',
        effectiveTitle,
        scrapeResult.metadata || {}
      );

      // Merge structured data and write results
      const { data: existing } = await supabase
        .from('training_materials')
        .select('structured_data')
        .eq('id', materialId)
        .single();

      const structuredDataMerged: any = {
        ...(existing?.structured_data || {}),
        ...(summaryResult.structuredData || {}),
      };
      if (summaryResult.brandTerms && summaryResult.brandTerms.length) {
        structuredDataMerged.brand_terms = summaryResult.brandTerms;
      }
      if (summaryResult.modelCodes && summaryResult.modelCodes.length) {
        structuredDataMerged.model_codes = summaryResult.modelCodes;
      }
      if (summaryResult.category) {
        structuredDataMerged.category = summaryResult.category;
      }

      await supabase
        .from('training_materials')
        .update({
          summary: summaryResult.summary,
          key_points: summaryResult.keyPoints || [],
          structured_data: structuredDataMerged,
          intent_keywords: summaryResult.intentKeywords || [],
          primary_products: summaryResult.primaryProducts || [],
          confidence_score: summaryResult.confidenceScore || 0,
          summarized_at: new Date().toISOString(),
          metadata: {
            ...(scrapeResult.metadata || {}),
            productInfo: summaryResult.productInfo
          }
        })
        .eq('id', materialId);
      console.log(`✅ Summarization completed: ${materialId}`);
    } catch (e) {
      console.warn(`⚠️ Summarization failed for ${materialId}:`, e instanceof Error ? e.message : e);
    }

    // Invalidate domain guard for this site so new subjects are live
    if (matForSite?.site_id) {
      try { await invalidateSiteDomainTerms(matForSite.site_id); } catch {}
    }

    // Automatically generate embeddings after successful scraping
    try {
      console.log(`🔄 Generating embeddings for material: ${materialId}`);
      const { ContentProcessor } = await import('@/lib/embeddings/processor');
      const processor = new ContentProcessor();
      await processor.processTrainingMaterial(materialId);
      console.log(`✅ Embeddings generated for material: ${materialId}`);
    } catch (embeddingError) {
      console.error('❌ Embedding generation failed:', embeddingError);
      // Don't fail the whole process, just log the error
    }

  } catch (error) {
    console.error('❌ Scraping error:', error);
    
    // Mark as failed
    await supabase
      .from('training_materials')
      .update({ 
        scrape_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('id', materialId);
  }
}
