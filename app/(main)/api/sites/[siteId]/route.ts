import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { siteUpdateSchema } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { z } from 'zod';

// Site ID parameter validation
const siteIdParamSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format')
});

// PATCH /api/sites/[siteId] - Update site
export const PATCH = createAPIRoute(
  {
    requireAuth: true,
    bodySchema: siteUpdateSchema,
    allowedMethods: ['PATCH']
  },
  async (context) => {
    const { body, supabase, userId, request } = context;
    const { siteId } = await (request as NextRequest & { params: { siteId: string } }).params;
    const siteData = body as typeof siteUpdateSchema._type;

    // Validate siteId parameter
    const paramValidation = siteIdParamSchema.safeParse({ siteId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid site ID format', 400);
    }

    // First verify ownership
    await executeDBOperation(
      async () => {
        const { data: site, error } = await supabase
          .from('sites')
          .select('id')
          .eq('id', siteId)
          .eq('user_id', userId!)
          .single();

        if (error || !site) {
          throw new Error('Site not found or unauthorized');
        }
      },
      { operation: 'verifySiteOwnership', siteId, userId }
    );

    // Update the site
    const updatedSite = await executeDBOperation(
      async () => {
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString()
        };

        if (siteData.name) updateData.name = siteData.name.trim();
        if (siteData.description !== undefined) updateData.description = siteData.description?.trim() || null;

        const { data, error } = await supabase
          .from('sites')
          .update(updateData)
          .eq('id', siteId)
          .eq('user_id', userId!)
          .select('id, name, description, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'updateSite', siteId, userId }
    );

    return createSuccessResponse(updatedSite, 'Site updated successfully');
  }
);

// DELETE /api/sites/[siteId] - Delete site
export const DELETE = createAPIRoute(
  {
    requireAuth: true,
    allowedMethods: ['DELETE']
  },
  async (context) => {
    const { supabase, userId, request } = context;
    const { siteId } = await (request as NextRequest & { params: { siteId: string } }).params;

    // Validate siteId parameter
    const paramValidation = siteIdParamSchema.safeParse({ siteId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid site ID format', 400);
    }

    // First verify ownership
    await executeDBOperation(
      async () => {
        const { data: site, error } = await supabase
          .from('sites')
          .select('id')
          .eq('id', siteId)
          .eq('user_id', userId!)
          .single();

        if (error || !site) {
          throw new Error('Site not found or unauthorized');
        }
      },
      { operation: 'verifySiteOwnership', siteId, userId }
    );

    // Delete the site (cascade will handle related data)
    await executeDBOperation(
      async () => {
        const { error } = await supabase
          .from('sites')
          .delete()
          .eq('id', siteId)
          .eq('user_id', userId!);

        if (error) throw error;
      },
      { operation: 'deleteSite', siteId, userId }
    );

    // Invalidate caches for this site
    const cacheKeys = [
      getCacheKey(siteId, 'affiliate_links'),
      getCacheKey(siteId, 'chat_settings'),
      getCacheKey(siteId, 'training_materials'),
      getCacheKey(siteId, 'predefined_questions')
    ];
    
    await Promise.all(cacheKeys.map(key => cache.del(key)));
    console.log(`🗑️ Cache invalidated for deleted site: ${siteId}`);

    return createSuccessResponse(null, 'Site deleted successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();