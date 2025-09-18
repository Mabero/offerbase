import { NextRequest, NextResponse } from 'next/server';
import { VectorSearchService } from '@/lib/embeddings/search';
import { createClient } from '@supabase/supabase-js';
import {
  verifySiteToken,
  getRequestOrigin,
  isWidgetRequestAllowed,
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type SiteToken,
} from '@/lib/widget-auth';

export async function POST(request: NextRequest) {
  try {
    const secureMode = process.env.SECURE_EMBEDDINGS_API === 'true';
    const origin = getRequestOrigin(request);

    // Parse request body
    const { 
      query, 
      siteId, 
      options = {},
      conversationHistory 
    } = await request.json();
    
    if (!query || !siteId) {
      return NextResponse.json(
        { error: 'query and siteId are required' },
        { status: 400 }
      );
    }
    
    // SECURITY (flagged): Require widget JWT + origin validation when enabled
    let allowedOriginsForCors: string[] = [];
    if (secureMode) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Bearer token required' },
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      const token = authHeader.substring(7);
      const decoded: SiteToken | null = verifySiteToken(token);
      if (!decoded) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      if (!origin || origin !== decoded.origin) {
        return NextResponse.json(
          { error: 'Origin mismatch' },
          { status: 403, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }
    }
    
    // Verify site exists and is active
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, name, widget_enabled, allowed_origins')
      .eq('id', siteId)
      .single();
    
    if (siteError || !site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404, headers: getCORSHeaders(origin, []) }
      );
    }
    
    if (secureMode) {
      // Validate site is enabled and origin is allowed
      if (!site.widget_enabled) {
        return NextResponse.json(
          { error: 'Widget disabled for site' },
          { status: 403, headers: getCORSHeaders(origin, []) }
        );
      }
      // Parse allowed origins defensively
      if (Array.isArray((site as any).allowed_origins)) {
        allowedOriginsForCors = (site as any).allowed_origins as string[];
      } else if (typeof (site as any).allowed_origins === 'string') {
        try {
          const parsed = JSON.parse((site as any).allowed_origins);
          allowedOriginsForCors = Array.isArray(parsed) ? parsed : [];
        } catch {
          allowedOriginsForCors = [];
        }
      }
      const validation = isWidgetRequestAllowed(origin, null, allowedOriginsForCors);
      if (!validation.allowed) {
        return NextResponse.json(
          { error: validation.reason || 'Origin not allowed' },
          { status: 403, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      // Rate limit per-site per-IP (skip localhost)
      const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
      const rateKey = getRateLimitKey(`embeddings:${siteId}`, clientIP);
      if (!isLocalhost && !rateLimiter.isAllowed(rateKey, 120, 60_000)) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429, headers: { ...getCORSHeaders(origin, allowedOriginsForCors), 'Retry-After': '60' } }
        );
      }
    }
    
    // Initialize search service
    const searchService = new VectorSearchService();
    
    // Perform search
    let results;
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Search with conversation context
      results = await searchService.searchWithContext(
        query,
        conversationHistory,
        siteId,
        options
      );
    } else {
      // Regular hybrid search
      results = await searchService.hybridSearch(
        query,
        siteId,
        options
      );
    }
    
    // Log search for analytics (optional)
    try {
      await supabase
        .from('search_logs')
        .insert({
          site_id: siteId,
          query,
          results_count: results.length,
          has_context: !!conversationHistory,
          options: options,
        });
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('Failed to log search:', logError);
    }
    
    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    }, {
      headers: secureMode ? getCORSHeaders(origin, allowedOriginsForCors) : {}
    });
  } catch (error) {
    console.error('Search error:', error);
    const origin = getRequestOrigin(request);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500, headers: getCORSHeaders(origin, []) }
    );
  }
}

// Find similar chunks endpoint
export async function GET(request: NextRequest) {
  try {
    const secureMode = process.env.SECURE_EMBEDDINGS_API === 'true';
    const origin = getRequestOrigin(request);
    const { searchParams } = new URL(request.url);
    const chunkId = searchParams.get('chunkId');
    const limit = parseInt(searchParams.get('limit') || '5');
    
    if (!chunkId) {
      return NextResponse.json(
        { error: 'chunkId is required' },
        { status: 400 }
      );
    }
    
    // Optional security: require JWT/origin validation
    let allowedOriginsForCors: string[] = [];
    if (secureMode) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Bearer token required' },
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }
      const token = authHeader.substring(7);
      const decoded: SiteToken | null = verifySiteToken(token);
      if (!decoded) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }
      if (!origin || origin !== decoded.origin) {
        return NextResponse.json(
          { error: 'Origin mismatch' },
          { status: 403, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }
    }

    // Initialize search service
    const searchService = new VectorSearchService();

    // Find similar chunks
    const results = await searchService.findSimilarChunks(chunkId, limit);

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    }, {
      headers: secureMode ? getCORSHeaders(origin, allowedOriginsForCors) : {}
    });
  } catch (error) {
    console.error('Find similar error:', error);
    return NextResponse.json(
      { error: 'Failed to find similar chunks' },
      { status: 500 }
    );
  }
}

// CORS preflight for embeddings search
export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  // Allow all for preflight (no credentials used)
  return new NextResponse(null, {
    status: 200,
    headers: getCORSHeaders(origin, ['*'])
  });
}
