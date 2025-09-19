import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getRequestOrigin, isWidgetRequestAllowed, getCORSHeaders, rateLimiter, getRateLimitKey } from '@/lib/widget-auth';
import { scrapeUrl } from '@/lib/scraping';
import { cache } from '@/lib/cache';
import { EmbeddingProviderFactory } from '@/lib/embeddings/factory';
import { TextChunker } from '@/lib/embeddings/chunker';

// Cache key helper
function pageKey(siteId: string, url: string) {
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  return `pagectx:${siteId}:${h}`;
}

export async function GET(request: NextRequest) {
  try {
    // Feature flag
    if (process.env.ENABLE_PAGE_CONTEXT === 'false') {
      return NextResponse.json({ enabled: false }, { status: 200 });
    }

    const origin = getRequestOrigin(request);
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || '';
    const url = searchParams.get('url') || '';
    if (!siteId || !url) {
      return NextResponse.json({ error: 'siteId and url are required' }, { status: 400 });
    }

    // Validate site + origin against allowed_origins
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, widget_enabled, allowed_origins')
      .eq('id', siteId)
      .eq('widget_enabled', true)
      .single();
    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or widget disabled' }, { status: 404 });
    }

    let allowedOrigins: string[] = [];
    if (Array.isArray(site.allowed_origins)) allowedOrigins = site.allowed_origins as string[];
    else if (typeof site.allowed_origins === 'string') {
      try { const parsed = JSON.parse(site.allowed_origins); if (Array.isArray(parsed)) allowedOrigins = parsed; } catch {}
    }

    const validation = isWidgetRequestAllowed(origin, null, allowedOrigins);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason || 'Origin not allowed' }, { status: 403, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Rate limit per site/ip
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
    const key = getRateLimitKey(`pagectx:${siteId}`, clientIP);
    if (!(await rateLimiter.isAllowed(key, 20, 60_000))) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { ...getCORSHeaders(origin, allowedOrigins), 'Retry-After': '60' } });
    }

    // Check cache
    const ck = pageKey(siteId, url);
    const ttlSec = Number(process.env.PAGE_CONTEXT_TTL_SECONDS ?? 900);
    const cached = await cache.get<any>(ck);
    if (cached) {
      return NextResponse.json({ success: true, cached: true }, { headers: getCORSHeaders(origin, allowedOrigins) });
    }

    // Scrape page
    const scraped = await scrapeUrl(url, { timeout: 15000 });
    if (!scraped.success) {
      return NextResponse.json({ error: scraped.error || 'Failed to scrape' }, { status: 502, headers: getCORSHeaders(origin, allowedOrigins) });
    }

    const title = scraped.metadata?.title ?? '';
    const content = scraped.content ?? '';

    // Chunk and embed ephemerally
    const chunker = new TextChunker({ chunkSize: 900, chunkOverlap: 120 });
    const chunks = chunker.chunk(content).map(c => c.content);

    // If no content to embed, cache an empty entry and return success
    if (!chunks || chunks.length === 0) {
      await cache.set(ck, { title, url, chunks: [] }, ttlSec);
      return NextResponse.json({ success: true, cached: false, empty: true }, { headers: getCORSHeaders(origin, allowedOrigins) });
    }

    const provider = EmbeddingProviderFactory.fromEnvironment();
    const embeddings = await provider.generateBatchEmbeddings(chunks);
    const payload = chunks.map((c, i) => ({ title: title || 'Page', content: c, embedding: embeddings[i] }));

    await cache.set(ck, { title, url, chunks: payload }, ttlSec);

    return NextResponse.json({ success: true, cached: false }, { headers: getCORSHeaders(origin, allowedOrigins) });
  } catch (error) {
    console.error('Page context error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  return new NextResponse(null, { status: 200, headers: getCORSHeaders(origin, ['*']) });
}
