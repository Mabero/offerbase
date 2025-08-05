import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { affiliateLinkSchema, siteIdQuerySchema, sanitizeUrl, validateRequest } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';

// GET /api/affiliate-links - Fetch affiliate links for a site
export const GET = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    querySchema: siteIdQuerySchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { siteId, supabase } = context;
    
    // Fetch affiliate links with retry logic
    const links = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('affiliate_links')
          .select('id, url, title, description, image_url, button_text, created_at, updated_at')
          .eq('site_id', siteId!)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      { operation: 'fetchAffiliateLinks', siteId, userId: context.userId }
    );

    return createSuccessResponse(links, 'Affiliate links fetched successfully');
  }
);

// POST /api/affiliate-links - Create new affiliate link
export const POST = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    bodySchema: affiliateLinkSchema,
    allowedMethods: ['POST']
  },
  async (context) => {
    const { body, siteId, supabase } = context;
    const linkData = body as typeof affiliateLinkSchema._type;

    // Sanitize URL input
    const sanitizedUrl = sanitizeUrl(linkData.url);
    
    // Create affiliate link with retry logic
    const link = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('affiliate_links')
          .insert([{
            site_id: siteId!,
            url: sanitizedUrl,
            title: linkData.title.trim(),
            description: linkData.description?.trim() || '',
            image_url: linkData.image_url?.trim() || null,
            button_text: linkData.button_text?.trim() || 'View Product'
          }])
          .select('id, url, title, description, image_url, button_text, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'createAffiliateLink', siteId, userId: context.userId }
    );

    // Invalidate cache for affiliate links
    await cache.del(getCacheKey(siteId!, 'affiliate_links'));
    console.log(`🗑️ Cache invalidated for affiliate links: ${siteId}`);

    return createSuccessResponse(link, 'Affiliate link created successfully', 201);
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();