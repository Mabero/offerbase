import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Input validation schemas
const siteIdParamSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format')
});

const siteUpdateSchema = z.object({
  name: z.string()
    .min(1, "Site name is required")
    .max(100, "Site name too long")
    .trim()
    .optional(),
  description: z.string()
    .max(500, "Description too long")
    .trim()
    .nullable()
    .optional()
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

// GET /api/sites/[siteId] - Get single site
export async function GET(
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
    
    // Fetch site with ownership verification
    const { data: site, error } = await supabase
      .from('sites')
      .select('id, name, description, created_at, updated_at')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (error || !site) {
      console.error('Site fetch error:', error);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    return createSuccessResponse(site, 'Site fetched successfully');

  } catch (error) {
    console.error('GET /api/sites/[siteId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// PUT /api/sites/[siteId] - Update site  
export async function PUT(
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

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 400);
    }

    const validation = siteUpdateSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ');
      return createErrorResponse(errorMessage, 400);
    }

    const siteData = validation.data;
    
    // Get Supabase client
    const supabase = getSupabaseClient();

    // First verify ownership
    const { data: existingSite, error: ownershipError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (ownershipError || !existingSite) {
      console.error('Site ownership verification failed:', ownershipError);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (siteData.name !== undefined) {
      updateData.name = siteData.name;
    }
    if (siteData.description !== undefined) {
      updateData.description = siteData.description || null;
    }

    // Update the site
    const { data: updatedSite, error: updateError } = await supabase
      .from('sites')
      .update(updateData)
      .eq('id', siteId)
      .eq('user_id', userId)
      .select('id, name, description, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Site update error:', updateError);
      return createErrorResponse('Failed to update site');
    }

    // Invalidate cache gracefully (don't fail if cache is unavailable)
    try {
      const { cache, getCacheKey } = await import('@/lib/cache');
      const cacheKeys = [
        getCacheKey(siteId, 'affiliate_links'),
        getCacheKey(siteId, 'chat_settings'),
        getCacheKey(siteId, 'training_materials'),
        getCacheKey(siteId, 'predefined_questions')
      ];
      
      await Promise.all(cacheKeys.map(key => cache.del(key)));
      console.log(`🗑️ Cache invalidated for updated site: ${siteId}`);
    } catch (cacheError) {
      console.warn(`⚠️ Cache invalidation failed for site ${siteId}:`, cacheError);
      // Continue execution - cache failure shouldn't break the API
    }

    return createSuccessResponse(updatedSite, 'Site updated successfully');

  } catch (error) {
    console.error('PUT /api/sites/[siteId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// PATCH /api/sites/[siteId] - Update site (alias for PUT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  // PATCH behavior is identical to PUT for this resource
  return PUT(request, { params });
}

// DELETE /api/sites/[siteId] - Delete site
export async function DELETE(
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

    // First verify ownership
    const { data: existingSite, error: ownershipError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (ownershipError || !existingSite) {
      console.error('Site ownership verification failed:', ownershipError);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    // Delete the site (cascade will handle related data)
    console.log(`🗑️ Attempting to delete site: ${siteId} for user: ${userId}`);
    
    const { error: deleteError } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error(`❌ Site deletion error:`, deleteError);
      console.error(`❌ Error details:`, {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
        hint: deleteError.hint
      });
      return createErrorResponse('Failed to delete site');
    }
    
    console.log(`✅ Site deleted successfully: ${siteId}`);

    // Invalidate cache gracefully (don't fail if cache is unavailable)
    try {
      const { cache, getCacheKey } = await import('@/lib/cache');
      const cacheKeys = [
        getCacheKey(siteId, 'affiliate_links'),
        getCacheKey(siteId, 'chat_settings'),
        getCacheKey(siteId, 'training_materials'),
        getCacheKey(siteId, 'predefined_questions')
      ];
      
      await Promise.all(cacheKeys.map(key => cache.del(key)));
      console.log(`🗑️ Cache invalidated for deleted site: ${siteId}`);
    } catch (cacheError) {
      console.warn(`⚠️ Cache invalidation failed for site ${siteId}:`, cacheError);
      // Continue execution - cache failure shouldn't break the API
    }

    return createSuccessResponse(null, 'Site deleted successfully');

  } catch (error) {
    console.error('DELETE /api/sites/[siteId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/sites/[siteId] - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}