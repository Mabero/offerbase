import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId || new URL(request.url).searchParams.get('site_id');
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: 'public' } }
    );

    // Verify ownership
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();
    if (siteErr || !site) return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });

    // Refresh MV (fire and wait)
    const { error: rpcErr } = await supabase.rpc('refresh_offer_metrics_daily');
    if (rpcErr) return NextResponse.json({ error: 'Failed to refresh metrics' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

