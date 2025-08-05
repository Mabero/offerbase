import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { affiliateLinkSchema, sanitizeUrl } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { z } from 'zod';

// Validation schema for link update (same as create but all fields optional)
const affiliateLinkUpdateSchema = affiliateLinkSchema.partial().omit({ siteId: true });

// PUT /api/affiliate-links/[linkId] - Update affiliate link
export const PUT = createAPIRoute(
  {
    requireAuth: true,
    bodySchema: affiliateLinkUpdateSchema,
    allowedMethods: ['PUT']
  },
  async (context) => {
    const { body, supabase, userId, request } = context;
    const { linkId } = await (request as any).params;
    const linkData = body as Partial<typeof affiliateLinkSchema._type>;

    // First verify ownership and get site_id
    const { siteId } = await executeDBOperation(
      async () => {
        const { data: link, error } = await supabase
          .from('affiliate_links')
          .select(`
            site_id,
            sites!inner (
              id,
              user_id
            )
          `)
          .eq('id', linkId)
          .eq('sites.user_id', userId!)
          .single();

        if (error || !link) {
          throw new Error('Link not found or unauthorized');
        }
        return { siteId: link.site_id };
      },
      { operation: 'verifyLinkOwnership', userId }
    );

    // Sanitize URL if provided
    const sanitizedUrl = linkData.url ? sanitizeUrl(linkData.url) : undefined;

    // Update the link
    const updatedLink = await executeDBOperation(
      async () => {
        const updateData: any = {
          updated_at: new Date().toISOString()
        };

        if (sanitizedUrl) updateData.url = sanitizedUrl;
        if (linkData.title) updateData.title = linkData.title.trim();
        if (linkData.description !== undefined) updateData.description = linkData.description?.trim() || '';
        if (linkData.image_url !== undefined) updateData.image_url = linkData.image_url?.trim() || null;
        if (linkData.button_text !== undefined) updateData.button_text = linkData.button_text?.trim() || 'View Product';

        const { data, error } = await supabase
          .from('affiliate_links')
          .update(updateData)
          .eq('id', linkId)
          .select('id, url, title, description, image_url, button_text, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'updateAffiliateLink', siteId, userId }
    );

    // Invalidate cache
    await cache.del(getCacheKey(siteId, 'affiliate_links'));
    console.log(`🗑️ Cache invalidated for affiliate links: ${siteId}`);

    return createSuccessResponse(updatedLink, 'Affiliate link updated successfully');
  }
);

// DELETE /api/affiliate-links/[linkId] - Delete affiliate link
export const DELETE = createAPIRoute(
  {
    requireAuth: true,
    allowedMethods: ['DELETE']
  },
  async (context) => {
    const { supabase, userId, request } = context;
    const { linkId } = await (request as any).params;

    // First verify ownership and get site_id
    const { siteId } = await executeDBOperation(
      async () => {
        const { data: link, error } = await supabase
          .from('affiliate_links')
          .select(`
            site_id,
            sites!inner (
              id,
              user_id
            )
          `)
          .eq('id', linkId)
          .eq('sites.user_id', userId!)
          .single();

        if (error || !link) {
          throw new Error('Link not found or unauthorized');
        }
        return { siteId: link.site_id };
      },
      { operation: 'verifyLinkOwnership', userId }
    );

    // Delete the link
    await executeDBOperation(
      async () => {
        const { error } = await supabase
          .from('affiliate_links')
          .delete()
          .eq('id', linkId);

        if (error) throw error;
      },
      { operation: 'deleteAffiliateLink', siteId, userId }
    );

    // Invalidate cache
    await cache.del(getCacheKey(siteId, 'affiliate_links'));
    console.log(`🗑️ Cache invalidated for affiliate links: ${siteId}`);

    return createSuccessResponse(null, 'Affiliate link deleted successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();