import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { processTrainingMaterialSummary } from '@/lib/ai/summarizer';
import { invalidateSiteDomainTerms } from '@/lib/ai/domain-guard';

// POST /api/debug/backfill-domain-terms?siteId=...&limit=10
// Summarizes up to N training materials missing AI fields, then invalidates domain terms
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId') || '';
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit') || 10), 50));
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

    // Fetch candidates lacking AI fields
    const { data: materials, error } = await supabase
      .from('training_materials')
      .select('id, title, intent_keywords, primary_products, content, scrape_status')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success')
      .not('content', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch materials', details: error }, { status: 500 });
    }

    const candidates = (materials || []).filter((m: any) =>
      (!Array.isArray(m.intent_keywords) || m.intent_keywords.length === 0) &&
      (!Array.isArray(m.primary_products) || m.primary_products.length === 0)
    ).slice(0, limit);

    const processed: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const m of candidates) {
      try {
        await processTrainingMaterialSummary(m.id);
        processed.push({ id: m.id, ok: true });
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 400));
      } catch (e: any) {
        processed.push({ id: m.id, ok: false, error: e?.message || 'failed' });
      }
    }

    await invalidateSiteDomainTerms(siteId);

    return NextResponse.json({
      siteId,
      requested: limit,
      processedCount: processed.length,
      processed,
      remainingApprox: Math.max(0, (materials?.length || 0) - processed.length),
    });
  } catch (error) {
    console.error('[debug/backfill-domain-terms] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

