import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getCacheKey, cache } from '@/lib/cache';
import { getSiteDomainTerms, matchDomainTerms, invalidateSiteDomainTerms } from '@/lib/ai/domain-guard';

// GET /api/debug/domain-terms?siteId=...&q=...&limit=...
// - Returns derived per-site domain terms (filtered), cache status, optional match info for q
// - If invalidate=true, clears the cached terms before deriving
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || '';
    const q = searchParams.get('q') || '';
    const limitParam = searchParams.get('limit');
    const limit = Math.max(1, Math.min(Number(limitParam || 200), 1000));
    const invalidate = searchParams.get('invalidate') === 'true';

    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify ownership
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id, user_id')
      .eq('id', siteId)
      .single();
    if (siteErr || !site || site.user_id !== userId) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 403 });
    }

    const cacheKey = getCacheKey(siteId, 'domain_terms');
    const cachedBefore = await cache.get<string[]>(cacheKey);

    if (invalidate) {
      await invalidateSiteDomainTerms(siteId);
    }

    const terms = await getSiteDomainTerms(siteId);
    const cachedAfter = await cache.get<string[]>(cacheKey);

    const sample = terms.slice(0, limit);
    const result: any = {
      siteId,
      count: terms.length,
      sample,
      cache: {
        hadBefore: Array.isArray(cachedBefore),
        hasAfter: Array.isArray(cachedAfter),
        key: cacheKey,
      },
    };

    if (q) {
      const matched = matchDomainTerms(q, terms, 200);
      result.query = {
        text: q,
        inDomain: matched.length > 0,
        matched,
      };
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[debug/domain-terms] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

