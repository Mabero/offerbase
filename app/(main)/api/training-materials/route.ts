import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

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

    // Trigger background processing (non-blocking)
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 
        request.headers.get('origin') ||
        `${request.nextUrl.protocol}//${request.nextUrl.host}` ||
        'http://localhost:3000';

    // Start background scraping process
    setTimeout(async () => {
      try {
        console.log(`🔄 Triggering background processing for material: ${data.id}`);
        
        const response = await fetch(`${baseUrl}/api/training-materials/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Forward the authorization to the background process
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || ''
          },
          body: JSON.stringify({
            materialId: data.id,
            retryCount: 0
          })
        });

        if (!response.ok) {
          console.error('❌ Background processing trigger failed:', response.status, await response.text());
        } else {
          console.log('✅ Background processing triggered successfully');
        }
      } catch (error) {
        console.error('❌ Failed to trigger background processing:', error);
        
        // Mark the material as failed so user knows something went wrong
        try {
          await supabase
            .from('training_materials')
            .update({ 
              scrape_status: 'failed',
              error_message: 'Failed to start background processing',
              updated_at: new Date().toISOString()
            })
            .eq('id', data.id);
        } catch (updateError) {
          console.error('❌ Failed to update material status after processing failure:', updateError);
        }
      }
    }, 100); // Small delay to ensure response is sent first

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