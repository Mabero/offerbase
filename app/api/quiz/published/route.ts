import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCORSHeaders, getRequestOrigin, isWidgetRequestAllowed, verifySiteToken, type SiteToken } from '@/lib/widget-auth';
import { getCacheKey, getCachedData, cache } from '@/lib/cache';
import { matchesUrlTargeting } from '@/lib/quiz/targeting';
import { QuizRecord } from '@/lib/quiz/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  return new NextResponse(null, { status: 200, headers: getCORSHeaders(origin, ['*']) });
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  try {
    // Feature flag: allow quick rollback
    if (process.env.NEXT_PUBLIC_ENABLE_QUIZ_BUILDER !== 'true') {
      return NextResponse.json({ enabled: false, quiz: null }, { status: 200, headers: getCORSHeaders(origin, ['*']) });
    }

    // Auth via widget token
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

    // Validate allowed origins for site
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id, allowed_origins, widget_enabled')
      .eq('id', siteId)
      .single();
    if (siteErr || !site || !site.widget_enabled) {
      return NextResponse.json({ error: 'Site not found or widget disabled' }, { status: 404, headers: getCORSHeaders(origin, []) });
    }
    const allowedOrigins: string[] = site.allowed_origins || [];
    const validation = isWidgetRequestAllowed(origin, decoded.parentOrigin || null, allowedOrigins);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason || 'Origin not allowed' }, { status: 403, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Parse URL parameter
    const { searchParams } = new URL(request.url);
    const pageUrl = searchParams.get('url') || '';
    if (!pageUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Cache key per site
    const cacheKey = getCacheKey(siteId, 'quizzes:published');
    const quizzes = await getCachedData<QuizRecord[]>(cacheKey, async () => {
      const { data, error } = await supabase
        .from('quizzes')
        .select('id, site_id, name, status, priority, definition, targeting, version, created_at, updated_at, published_at')
        .eq('site_id', siteId)
        .eq('status', 'published')
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) {
        console.warn('Fetch quizzes error:', error);
        return [] as QuizRecord[];
      }
      return (data || []) as unknown as QuizRecord[];
    }, 60); // 60s TTL

    // Pick the highest priority quiz that matches the URL targeting
    const matching = (quizzes || []).find(q => {
      try { return matchesUrlTargeting(pageUrl, q.targeting as any); } catch { return false; }
    }) || null;

    return NextResponse.json({ enabled: true, quiz: matching }, { status: 200, headers: { ...getCORSHeaders(origin, allowedOrigins), 'Cache-Control': 'public, max-age=20' } });
  } catch (e) {
    console.error('Quiz published GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCORSHeaders(origin, []) });
  }
}

