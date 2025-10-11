import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractContextKeywords, type TrainingChunk } from '@/lib/context-keywords';
import { getSiteConfig } from '@/lib/site-config';
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

    // Validate site + allowed origins (cached)
    const site = await getSiteConfig(supabase, siteId, false);
    if (!site || !site.widget_enabled) {
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

    // Build context keywords (prefer page context when present)
    let finalContextKeywords: string[] = [];
    if (Array.isArray(contextKeywords)) {
      finalContextKeywords = contextKeywords;
    } else if (pageContext && (pageContext.title || pageContext.description)) {
      const pseudoChunks: TrainingChunk[] = [{
        content: String(pageContext.description || ''),
        materialTitle: String(pageContext.title || '')
      }];
      finalContextKeywords = extractContextKeywords(pseudoChunks, query);
    } else if (Array.isArray(trainingChunks) && trainingChunks.length > 0) {
      finalContextKeywords = extractContextKeywords(trainingChunks as TrainingChunk[], query);
    } else {
      finalContextKeywords = extractContextKeywords([], query);
    }

    // Call contextual offers RPC
    const { data, error } = await supabase.rpc('match_offers_contextual', {
      p_site_id: siteId,
      p_query: query.trim(),
      // Prefer AI text only when page context exists; otherwise stick to user query
      p_ai_text: (pageContext && (pageContext.title || pageContext.description)) ? aiText : null,
      p_context_keywords: finalContextKeywords,
      p_limit: Math.min(limit, 20)
    });
    if (error) {
      console.error('match_offers_contextual error:', error);
      return NextResponse.json({ error: 'Failed to match offers' }, { status: 500, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    const results = (data || []).map((r: any) => ({
      id: r.link_id ?? r.id, // prefer affiliate_links.id for stable analytics
      link_id: r.link_id ?? null,
      offer_id: r.id ?? null,
      title: r.title,
      url: r.url,
      image_url: r.image_url,
      button_text: r.button_text || 'Learn more',
      description: r.description || '',
      brand_norm: r.brand_norm || null,
      model_norm: r.model_norm || null,
      match_type: r.match_type,
      match_score: r.match_score,
    }));

    // Enforce one-or-ask: never return multiple conflicting products
    const pageHasContext = !!(pageContext && (pageContext.title || pageContext.description));
    const AHEAD_DELTA = 0.12;

    // Helper: cluster by normalized brand+model
    const clusters = new Map<string, { key: string; items: any[]; topScore: number }>();
    for (const item of results) {
      const key = `${(item.brand_norm || '').trim()}|${(item.model_norm || '').trim()}`;
      const c = clusters.get(key) || { key, items: [], topScore: 0 };
      c.items.push(item);
      c.topScore = Math.max(c.topScore, item.match_score || 0);
      clusters.set(key, c);
    }

    // If no results, return empty
    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        query: query.trim(),
        count: 0,
        candidatesCount: 0,
        contextualMatching: {
          contextKeywords: finalContextKeywords,
          pageContextUsed: pageHasContext
        },
        responseTime: Date.now() - start,
      }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=15' } });
    }

    // Single product: return it
    if (results.length === 1) {
      return NextResponse.json({
        success: true,
        data: [results[0]],
        query: query.trim(),
        count: 1,
        candidatesCount: 1,
        contextualMatching: {
          contextKeywords: finalContextKeywords,
          pageContextUsed: pageHasContext
        },
        responseTime: Date.now() - start,
      }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=30' } });
    }

    // Sort clusters by top score
    const sortedClusters = Array.from(clusters.values()).sort((a, b) => b.topScore - a.topScore);
    const top1 = sortedClusters[0];
    const top2 = sortedClusters[1];

    // If page context exists, pick the overall top result deterministically
    if (pageHasContext) {
      const topItem = results[0];
      return NextResponse.json({
        success: true,
        data: [topItem],
        query: query.trim(),
        count: 1,
        candidatesCount: results.length,
        contextualMatching: {
          contextKeywords: finalContextKeywords,
          pageContextUsed: pageHasContext
        },
        responseTime: Date.now() - start,
      }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=30' } });
    }

    // Ambiguity detection (no page context): if multiple clusters and top2 is close to top1, ask clarification
    const ambiguous = sortedClusters.length > 1 && top2 && (top2.topScore >= (top1.topScore - AHEAD_DELTA));

    if (ambiguous) {
      // Build simple category inference
      const inferCategory = (t?: string, d?: string): { category: string; displayName: string } => {
        const text = `${t || ''} ${d || ''}`.toLowerCase();
        if (/(vacuum|støvsuger|stovsuger|aspiradora|staubsauger)/.test(text)) {
          return { category: 'vacuum', displayName: 'Vacuum cleaner' };
        }
        if (/(ipl|hair removal|hårfjerning|epilator|laser)/.test(text)) {
          return { category: 'hair-removal', displayName: 'IPL hair removal' };
        }
        return { category: 'other', displayName: (t || 'Option') };
      };

      const topClusters = sortedClusters.slice(0, 2);
      const options = topClusters.map(c => {
        const head = c.items[0];
        const inferred = inferCategory(head?.title, head?.description);
        return {
          category: inferred.category,
          displayName: inferred.displayName,
          products: c.items.map(p => ({
            id: p.id,
            link_id: p.link_id,
            offer_id: p.offer_id,
            title: p.title,
            url: p.url,
            image_url: p.image_url,
            button_text: p.button_text,
            description: p.description
          }))
        };
      });

      return NextResponse.json({
        success: true,
        data: [],
        clarification: {
          shouldAsk: true,
          reason: 'ambiguous_short_code',
          confidence: 'medium',
          options
        },
        query: query.trim(),
        count: 0,
        candidatesCount: results.length,
        contextualMatching: {
          contextKeywords: finalContextKeywords,
          pageContextUsed: pageHasContext
        },
        responseTime: Date.now() - start,
      }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'no-store' } });
    }

    // Otherwise, return only the single best item (never multiple)
    return NextResponse.json({
      success: true,
      data: [results[0]],
      query: query.trim(),
      count: 1,
      candidatesCount: results.length,
      contextualMatching: {
        contextKeywords: finalContextKeywords,
        pageContextUsed: pageHasContext
      },
      responseTime: Date.now() - start,
    }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=30' } });
  } catch (e) {
    console.error('Offers match API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCORSHeaders(origin, []) });
  }
}
