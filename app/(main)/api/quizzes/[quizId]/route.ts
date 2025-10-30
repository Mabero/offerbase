import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { cache } from '@/lib/cache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH /api/quizzes/[quizId]
export async function PATCH(request: NextRequest, { params }: { params: { quizId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const quizId = params.quizId;
    const body = await request.json();
    const { name, status, priority, targeting, definition } = body || {};

    // Fetch quiz and verify ownership via site
    const { data: quiz, error: qErr } = await supabase
      .from('quizzes')
      .select('id, site_id, status')
      .eq('id', quizId)
      .single();
    if (qErr || !quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id')
      .eq('id', quiz.site_id)
      .eq('user_id', userId)
      .single();
    if (siteErr || !site) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const update: any = {};
    if (typeof name === 'string') update.name = name;
    if (typeof priority === 'number') update.priority = priority;
    if (targeting) update.targeting = targeting;
    if (definition) {
      update.definition = definition;
      update.version = Number(definition.version || 1);
    }
    if (status === 'draft' || status === 'published') {
      update.status = status;
      update.published_at = status === 'published' ? new Date().toISOString() : null;
    }

    const { data, error } = await supabase
      .from('quizzes')
      .update(update)
      .eq('id', quizId)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: 'Failed to update quiz', details: error }, { status: 500 });

    // Invalidate widget cache for this site
    try { await cache.del(`chat:${quiz.site_id}:quizzes:published`); } catch {}

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Quiz PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/quizzes/[quizId]
export async function DELETE(_request: NextRequest, { params }: { params: { quizId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const quizId = params.quizId;
    const { data: quiz, error: qErr } = await supabase
      .from('quizzes')
      .select('id, site_id')
      .eq('id', quizId)
      .single();
    if (qErr || !quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id')
      .eq('id', quiz.site_id)
      .eq('user_id', userId)
      .single();
    if (siteErr || !site) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { error } = await supabase
      .from('quizzes')
      .delete()
      .eq('id', quizId);
    if (error) return NextResponse.json({ error: 'Failed to delete quiz', details: error }, { status: 500 });

    try { await cache.del(`chat:${quiz.site_id}:quizzes:published`); } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Quiz DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

