import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { batchSummarizeTrainingMaterials } from '@/lib/ai/summarizer';
import { z } from 'zod';

// Site ID parameter validation
const siteIdParamSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format')
});

// Helper function to get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// Helper function to create error response
function createErrorResponse(message: string, status: number = 500) {
  const response = NextResponse.json({ error: message }, { status });
  return addCorsHeaders(response);
}

// Helper function to create success response
function createSuccessResponse(data: unknown, message?: string, status: number = 200) {
  const response = NextResponse.json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  }, { status });
  return addCorsHeaders(response);
}

// POST /api/sites/[siteId]/summarize-materials - Start batch summarization
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get and validate parameters
    const { siteId } = await params;
    const paramValidation = siteIdParamSchema.safeParse({ siteId });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid site ID format', 400);
    }

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      console.error('Site ownership verification failed:', siteError);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    // Check if there are materials to summarize
    const { count: materialsCount, error: countError } = await supabase
      .from('training_materials')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('scrape_status', 'success');

    if (countError) {
      console.error('Materials count error:', countError);
      return createErrorResponse('Failed to count training materials');
    }

    if (!materialsCount || materialsCount === 0) {
      return createErrorResponse('No training materials available for summarization', 404);
    }

    // Start summarization process in background
    batchSummarizeTrainingMaterials(siteId).catch(error => {
      console.error('Background summarization error:', error);
    });

    return createSuccessResponse(
      { materialsCount, siteId },
      `Summarization started for ${materialsCount} training materials`,
      202 // Accepted - processing in background
    );

  } catch (error) {
    console.error('POST /api/sites/[siteId]/summarize-materials error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/sites/[siteId]/summarize-materials - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}