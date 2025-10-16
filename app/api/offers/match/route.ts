import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractContextKeywords, type TrainingChunk } from '@/lib/context-keywords';
import { analyzeContentIntelligence } from '@/lib/ai/content-intelligence';
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

    type OfferItem = {
      id: string;
      link_id: string | null;
      offer_id: string | null;
      title: string;
      url: string;
      image_url?: string | null;
      button_text: string;
      description: string;
      brand_norm: string | null;
      model_norm: string | null;
      match_type?: string;
      match_score: number;
      effectiveScore?: number;
    };

    const results: OfferItem[] = (data || []).map((r: any): OfferItem => ({
      id: r.link_id ?? r.id, // prefer affiliate_links.id for stable analytics
      link_id: r.link_id ?? null,
      offer_id: r.id ?? null,
      title: r.title,
      url: r.url,
      image_url: r.image_url,
      button_text: r.button_text || 'Learn more',
      description: r.description || '',
      brand_norm: (r.brand_norm ?? null),
      model_norm: (r.model_norm ?? null),
      match_type: r.match_type,
      match_score: typeof r.match_score === 'number' ? r.match_score : 0,
    }));

    // Winner anchoring: lightly boost the item named as best in the AI reply
    const WINNER_BOOST = Number(process.env.OFFER_WINNER_BOOST ?? 0.08);
    const RANK1_BOOST = Number(process.env.OFFER_RANK1_BOOST ?? 0.04);
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let winnerNorm: string | null = null;
    let rank1Norm: string | null = null;
    try {
      if (typeof aiText === 'string' && aiText.trim().length > 0) {
        const analysis = analyzeContentIntelligence('', aiText);
        if (analysis?.structuredData?.winner?.product) {
          winnerNorm = norm(analysis.structuredData.winner.product);
        }
        if (analysis?.structuredData?.rankings && analysis.structuredData.rankings.length > 0) {
          const top = analysis.structuredData.rankings[0];
          if (top?.product) rank1Norm = norm(top.product);
        }
      }
    } catch {}

    // Compute effective score with small deterministic boost if AI text explicitly recommends an item
    const scoredResults: OfferItem[] = results.map((item: OfferItem) => {
      const titleNorm = norm(item.title);
      const bmNorm = norm(`${item.brand_norm || ''} ${item.model_norm || ''}`);
      const keys = [titleNorm, bmNorm];
      const isWinner = !!(winnerNorm && keys.some(k => k && (k.includes(winnerNorm!) || winnerNorm!.includes(k))));
      const isRank1 = !!(rank1Norm && keys.some(k => k && (k.includes(rank1Norm!) || rank1Norm!.includes(k))));
      const effectiveScore = item.match_score + (isWinner ? WINNER_BOOST : 0) + (isRank1 ? RANK1_BOOST : 0);
      return { ...item, effectiveScore };
    });

    // Enforce one-or-ask: never return multiple conflicting products
    const pageHasContext = !!(pageContext && (pageContext.title || pageContext.description));
    const AHEAD_DELTA = 0.12;

    // Helper: cluster by normalized brand+model
    const clusters = new Map<string, { key: string; items: OfferItem[]; topScore: number }>();
    for (const item of scoredResults) {
      const bn = (item.brand_norm || '').trim();
      const mn = (item.model_norm || '').trim();
      // Fallback: if both norms missing, avoid empty-key collapse by using a stable identifier
      const fallbackKey = item.link_id || item.offer_id || item.id || item.url || item.title;
      const key = (bn || mn) ? `${bn}|${mn}` : String(fallbackKey);
      const c = clusters.get(key) || { key, items: [], topScore: 0 };
      c.items.push(item);
      c.topScore = Math.max(c.topScore, item.effectiveScore || item.match_score || 0);
      clusters.set(key, c);
    }

    // If no results, return empty
    if (scoredResults.length === 0) {
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
    if (scoredResults.length === 1) {
      return NextResponse.json({
        success: true,
        data: [scoredResults[0]],
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
    const sortedClusters = Array.from(clusters.values()).sort((a, b) => {
      const d = (b.topScore || 0) - (a.topScore || 0);
      if (d !== 0) return d;
      return String(a.key).localeCompare(String(b.key));
    });
    const top1 = sortedClusters[0];
    const top2 = sortedClusters[1];

    // Helper: pick one best item per cluster and cap to max 3 (or provided limit if lower)
    const maxReturn = Math.min(3, Math.max(1, Number(limit || 3)));
    const safeCmp = (a: any, b: any) => String(a || '').localeCompare(String(b || ''));
    const pickTopItems = () => {
      const items = sortedClusters
        .map(c => c.items
          .slice()
          .sort((a: any, b: any) => {
            const d = (b.effectiveScore || b.match_score || 0) - (a.effectiveScore || a.match_score || 0);
            if (d !== 0) return d;
            // Deterministic tie-breakers
            const t = safeCmp(a.title, b.title); if (t !== 0) return t;
            const u = safeCmp(a.url, b.url); if (u !== 0) return u;
            const i = safeCmp(a.id, b.id); if (i !== 0) return i;
            return 0;
          })[0]
        )
        .slice(0, maxReturn);
      return items;
    };

    // If page context exists, return top up to 3 deterministically
    if (pageHasContext) {
      const topItems = pickTopItems();
      return NextResponse.json({
        success: true,
        data: topItems,
        query: query.trim(),
        count: topItems.length,
        candidatesCount: scoredResults.length,
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
        candidatesCount: scoredResults.length,
        contextualMatching: {
          contextKeywords: finalContextKeywords,
          pageContextUsed: pageHasContext
        },
        responseTime: Date.now() - start,
      }, { headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'no-store' } });
    }

    // Otherwise, return up to top 3 distinct best items (by cluster)
    const topItems = pickTopItems();
    return NextResponse.json({
      success: true,
      data: topItems,
      query: query.trim(),
      count: topItems.length,
      candidatesCount: scoredResults.length,
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
