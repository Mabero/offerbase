import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { scrapeUrl } from '@/lib/scraping'
import { analyzeContentIntelligence } from '@/lib/ai/content-intelligence'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Get training materials for this site
    const { data: materials, error } = await supabase
      .from('training_materials')
      .select('id, url, title, content, content_type, metadata, scrape_status, last_scraped_at, error_message, created_at, updated_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching training materials:', error)
      return NextResponse.json({ error: 'Failed to fetch training materials' }, { status: 500 })
    }

    return NextResponse.json({ materials })
  } catch (error) {
    console.error('Error in GET /api/training-materials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId, url } = await request.json()

    if (!siteId || !url) {
      return NextResponse.json({ error: 'Site ID and URL are required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Extract title from URL
    let title = url.trim()
    try {
      const urlObj = new URL(url)
      title = urlObj.hostname
    } catch {
      // If URL is invalid, use the original string
      title = url.trim()
    }

    // Create the training material with pending scrape status
    const { data: material, error } = await supabase
      .from('training_materials')
      .insert([{
        site_id: siteId,
        url: url.trim(),
        title: title,
        scrape_status: 'pending'
      }])
      .select('id, url, title, scrape_status, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating training material:', error)
      return NextResponse.json({ error: 'Failed to create training material' }, { status: 500 })
    }

    // Trigger content scraping asynchronously
    scrapeContentForMaterial(material.id, url.trim()).catch(error => {
      console.error('Error triggering scrape:', error)
    })

    return NextResponse.json({ material }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/training-materials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Function to scrape content for a training material
async function scrapeContentForMaterial(materialId: string, url: string) {
  const supabase = createSupabaseAdminClient()
  
  try {
    // Update status to processing
    const { error: updateError } = await supabase
      .from('training_materials')
      .update({ scrape_status: 'processing' })
      .eq('id', materialId)
    
    if (updateError) {
      console.error('Error updating status to processing:', updateError);
    }
    
    // Use the shared scraping function directly
    const scrapeResult = await scrapeUrl(url);
    
    if (scrapeResult.success) {
      // Analyze content intelligence
      const title = scrapeResult.metadata?.title || url;
      const content = scrapeResult.content || '';
      const metadata = scrapeResult.metadata || {};
      
      const analysis = analyzeContentIntelligence(title, content, metadata);
      
      // Update training material with scraped content and intelligence analysis
      const { error: successUpdateError } = await supabase
        .from('training_materials')
        .update({
          content: scrapeResult.content,
          content_type: analysis.contentType, // Use analyzed content type instead of generic scraper result
          metadata: scrapeResult.metadata,
          structured_data: analysis.structuredData,
          intent_keywords: analysis.intentKeywords,
          primary_products: analysis.primaryProducts,
          confidence_score: analysis.confidenceScore,
          scrape_status: 'success',
          last_scraped_at: new Date().toISOString(),
          title: title,
        })
        .eq('id', materialId)
      
      if (successUpdateError) {
        console.error('Error updating material with success:', successUpdateError);
      } else {
        console.log(`Content intelligence analysis complete for material ${materialId}:`, {
          contentType: analysis.contentType,
          structuredDataFields: Object.keys(analysis.structuredData).length,
          intentKeywords: analysis.intentKeywords.length,
          primaryProducts: analysis.primaryProducts.length,
          confidenceScore: analysis.confidenceScore
        });
      }
    } else {
      // Update with error
      const { error: failUpdateError } = await supabase
        .from('training_materials')
        .update({
          scrape_status: 'failed',
          error_message: scrapeResult.error
        })
        .eq('id', materialId)
      
      if (failUpdateError) {
        console.error('Error updating material with failure:', failUpdateError);
      }
    }
  } catch (error) {
    console.error('Error in scrapeContentForMaterial:', error)
    
    // Update with error
    await supabase
      .from('training_materials')
      .update({
        scrape_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', materialId)
  }
}