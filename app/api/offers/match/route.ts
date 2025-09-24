import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractContextKeywords, type TrainingChunk } from '@/lib/context-keywords';
import {
  verifySiteToken,
  getRequestOrigin,
  isWidgetRequestAllowed,
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type SiteToken,
} from '@/lib/widget-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  return new NextResponse(null, { status: 200, headers: getCORSHeaders(origin, ['*']) });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const origin = getRequestOrigin(request);
  try {
    // Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Bearer token required' }, { status: 401, headers: getCORSHeaders(origin, []) });
    }
    const token = authHeader.substring(7);
    const decoded: SiteToken | null = verifySiteToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: getCORSHeaders(origin, []) });
    }
    if (!origin || origin !== decoded.origin) {
      return NextResponse.json({ error: 'Origin mismatch' }, { status: 403, headers: getCORSHeaders(origin, []) });
    }
    const siteId = decoded.siteId;

    // Validate site + allowed origins
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('allowed_origins, widget_rate_limit_per_minute, widget_enabled')
      .eq('id', siteId)
      .eq('widget_enabled', true)
      .single();
    if (siteErr || !site) {
      return NextResponse.json({ error: 'Site not found or widget disabled' }, { status: 404, headers: getCORSHeaders(origin, []) });
    }
    const allowedOrigins: string[] = site.allowed_origins || [];
    const validation = isWidgetRequestAllowed(origin, decoded.parentOrigin || null, allowedOrigins);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason || 'Origin not allowed' }, { status: 403, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Rate limit (skip localhost)
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    const rateKey = getRateLimitKey(`offers:${siteId}`, clientIP);
    const limitPerMin = site.widget_rate_limit_per_minute || 60;
    if (!isLocalhost && !(await rateLimiter.isAllowed(rateKey, limitPerMin, 60_000))) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { ...getCORSHeaders(origin, allowedOrigins), 'Retry-After': '60' } });
    }

    // Parse body
    const body = await request.json();
    const {
      query,
      limit = 12,
      aiText,
      contextKeywords,
      trainingChunks,
      pageContext,
    } = body || {};

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query parameter is required' }, { status: 400, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Build context keywords
    let finalContextKeywords: string[] = [];
    if (Array.isArray(contextKeywords)) {
      finalContextKeywords = contextKeywords;
    } else if (Array.isArray(trainingChunks) && trainingChunks.length > 0) {
      finalContextKeywords = extractContextKeywords(trainingChunks as TrainingChunk[], query);
    } else {
      finalContextKeywords = extractContextKeywords([], query);
    }

    // Call contextual offers RPC
    const { data, error } = await supabase.rpc('match_offers_contextual', {
      p_site_id: siteId,
      p_query: query.trim(),
      p_ai_text: aiText || query,
      p_context_keywords: finalContextKeywords,
      p_limit: Math.min(limit, 20)
    });
    if (error) {
      console.error('match_offers_contextual error:', error);
      return NextResponse.json({ error: 'Failed to match offers' }, { status: 500, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    const results = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      image_url: r.image_url,
      button_text: r.button_text || 'Learn more',
      description: r.description || '',
      match_type: r.match_type,
      match_score: r.match_score,
    }));

    return NextResponse.json({
      success: true,
      data: results,
      query: query.trim(),
      count: results.length,
      candidatesCount: results.length,
      contextualMatching: {
        contextKeywords: finalContextKeywords,
        pageContextUsed: !!(pageContext && (pageContext.title || pageContext.description))
      },
      responseTime: Date.now() - start,
    }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=30' } });
  } catch (e) {
    console.error('Offers match API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCORSHeaders(origin, []) });
  }
}

