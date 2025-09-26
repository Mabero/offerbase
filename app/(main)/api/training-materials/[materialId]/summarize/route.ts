import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { processTrainingMaterialSummary } from '@/lib/ai/summarizer';
import { invalidateSiteDomainTerms } from '@/lib/ai/domain-guard';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ materialId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { materialId } = await context.params;
    const supabase = createSupabaseAdminClient();
    
    // Verify the material belongs to the user
    const { data: material, error } = await supabase
      .from('training_materials')
      .select('site_id')
      .eq('id', materialId)
      .single();

    if (error || !material) {
      return NextResponse.json({ error: 'Training material not found' }, { status: 404 });
    }

    // Verify the site belongs to the user
    const { data: site } = await supabase
      .from('sites')
      .select('user_id')
      .eq('id', material.site_id)
      .single();

    if (!site || site.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Process the summary
    await processTrainingMaterialSummary(materialId);

    // Fetch the updated material
    const { data: updatedMaterial } = await supabase
      .from('training_materials')
      .select('*')
      .eq('id', materialId)
      .single();

    // Invalidate domain guard so new intent keywords apply immediately
    try { await invalidateSiteDomainTerms(material.site_id); } catch {}

    return NextResponse.json({ 
      success: true, 
      material: updatedMaterial 
    });

  } catch (error) {
    console.error('Error summarizing training material:', error);
    return NextResponse.json(
      { error: 'Failed to summarize training material' },
      { status: 500 }
    );
  }
}
