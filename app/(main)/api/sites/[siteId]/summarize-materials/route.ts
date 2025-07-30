import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { batchSummarizeTrainingMaterials } from '@/lib/ai/summarizer';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId } = await context.params;
    const supabase = createSupabaseAdminClient();
    
    // Verify the site belongs to the user
    const { data: site, error } = await supabase
      .from('sites')
      .select('user_id')
      .eq('id', siteId)
      .single();

    if (error || !site || site.user_id !== userId) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 403 });
    }

    // Process summaries in the background
    // In a production app, you'd want to use a proper job queue
    batchSummarizeTrainingMaterials(siteId).catch(error => {
      console.error('Background summarization error:', error);
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Summarization started in background' 
    });

  } catch (error) {
    console.error('Error starting batch summarization:', error);
    return NextResponse.json(
      { error: 'Failed to start summarization' },
      { status: 500 }
    );
  }
}