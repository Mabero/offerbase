import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { cache } from '@/lib/cache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/quizzes?siteId=...
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });

    const { data, error } = await supabase
      .from('quizzes')
      .select('id, site_id, name, status, priority, targeting, definition, version, created_at, updated_at, published_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: 'Failed to fetch quizzes', details: error }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Quizzes GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/quizzes
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const { siteId, name, status = 'draft', priority = 0, targeting = { include: [], exclude: [] }, definition } = body || {};
    if (!siteId || !name || !definition) {
      return NextResponse.json({ error: 'siteId, name, and definition are required' }, { status: 400 });
    }

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();
    if (siteError || !site) return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });

    const { data, error } = await supabase
      .from('quizzes')
      .insert([{ site_id: siteId, name: String(name), status, priority, targeting, definition, version: Number(definition?.version || 1) }])
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create quiz', details: error }, { status: 500 });

    // Invalidate widget cache for published quizzes (safe even if draft)
    try { await cache.del(`chat:${siteId}:quizzes:published`); } catch {}

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('Quizzes POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
