import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

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

// POST /api/training-materials/[materialId]/retry - Retry failed scraping
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createResponse({ error: 'Authentication required' }, 'Unauthorized', 401);
    }

    // Get and validate parameters
    const { materialId } = await params;
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(materialId)) {
      return createResponse({ error: 'Invalid material ID format' }, 'Bad Request', 400);
    }

    console.log(`🔄 Manual retry requested for material: ${materialId}`);

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

    // Check if retry is appropriate
    if (material.scrape_status === 'success') {
      return createResponse({ 
        materialId,
        status: material.scrape_status,
        message: 'Material already scraped successfully' 
      });
    }

    if (material.scrape_status === 'processing') {
      return createResponse({ 
        materialId,
        status: material.scrape_status,
        message: 'Material is already being processed' 
      });
    }

    // Reset status to pending for retry
    const { error: resetError } = await supabase
      .from('training_materials')
      .update({ 
        scrape_status: 'pending',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', materialId);

    if (resetError) {
      console.error('❌ Failed to reset material status:', resetError);
      return createResponse({ error: 'Failed to reset material status' }, 'Internal Error', 500);
    }

    // Trigger background processing
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 
        request.headers.get('origin') ||
        `${request.nextUrl.protocol}//${request.nextUrl.host}` ||
        'http://localhost:3000';

    // Start background scraping process (non-blocking)
    setTimeout(async () => {
      try {
        console.log(`🔄 Triggering background processing for retry: ${materialId}`);
        
        const response = await fetch(`${baseUrl}/api/training-materials/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Forward the authorization to the background process
            'Authorization': request.headers.get('Authorization') || '',
            'Cookie': request.headers.get('Cookie') || ''
          },
          body: JSON.stringify({
            materialId: materialId,
            retryCount: 0
          })
        });

        if (!response.ok) {
          console.error('❌ Background processing trigger failed:', response.status, await response.text());
          
          // Mark as failed if we can't trigger processing
          await supabase
            .from('training_materials')
            .update({ 
              scrape_status: 'failed',
              error_message: 'Failed to trigger retry processing',
              updated_at: new Date().toISOString()
            })
            .eq('id', materialId);
        } else {
          console.log('✅ Background processing triggered successfully for retry');
        }
      } catch (error) {
        console.error('❌ Failed to trigger background processing for retry:', error);
        
        // Mark as failed if we can't trigger processing
        await supabase
          .from('training_materials')
          .update({ 
            scrape_status: 'failed',
            error_message: 'Failed to trigger retry processing',
            updated_at: new Date().toISOString()
          })
          .eq('id', materialId);
      }
    }, 100);

    console.log(`✅ Manual retry initiated for material: ${materialId}`);

    return createResponse({
      materialId,
      status: 'retry_initiated',
      message: 'Retry processing initiated successfully'
    });

  } catch (error) {
    console.error('❌ Manual retry error:', error);
    return createResponse(
      { error: error instanceof Error ? error.message : 'Unknown error occurred' }, 
      'Internal Server Error', 
      500
    );
  }
}

// OPTIONS /api/training-materials/[materialId]/retry - CORS preflight
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