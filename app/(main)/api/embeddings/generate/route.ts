import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ContentProcessor } from '@/lib/embeddings/processor';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Parse request body
    const { materialId, materialIds, siteId } = await request.json();
    
    if (!materialId && !materialIds && !siteId) {
      return NextResponse.json(
        { error: 'materialId, materialIds, or siteId required' },
        { status: 400 }
      );
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Verify ownership if single material
    if (materialId) {
      const { data: material, error } = await supabase
        .from('training_materials')
        .select('site_id, sites!inner(user_id)')
        .eq('id', materialId)
        .single();
      
      if (error || !material || material.sites.user_id !== userId) {
        return NextResponse.json(
          { error: 'Material not found or unauthorized' },
          { status: 404 }
        );
      }
    }
    
    // Verify ownership if multiple materials
    if (materialIds && Array.isArray(materialIds)) {
      const { data: materials, error } = await supabase
        .from('training_materials')
        .select('id, sites!inner(user_id)')
        .in('id', materialIds);
      
      if (error || !materials) {
        return NextResponse.json(
          { error: 'Failed to verify materials' },
          { status: 500 }
        );
      }
      
      const unauthorized = materials.some(m => m.sites.user_id !== userId);
      if (unauthorized) {
        return NextResponse.json(
          { error: 'One or more materials unauthorized' },
          { status: 403 }
        );
      }
    }
    
    // Verify site ownership
    if (siteId) {
      const { data: site, error } = await supabase
        .from('sites')
        .select('user_id')
        .eq('id', siteId)
        .single();
      
      if (error || !site || site.user_id !== userId) {
        return NextResponse.json(
          { error: 'Site not found or unauthorized' },
          { status: 404 }
        );
      }
    }
    
    // Initialize content processor
    const processor = new ContentProcessor();
    
    // Process based on request type
    let results;
    
    if (materialId) {
      // Process single material
      results = await processor.processTrainingMaterial(materialId);
    } else if (materialIds) {
      // Process multiple materials
      results = await processor.processBatch(materialIds);
    } else if (siteId) {
      // Process all materials for site
      results = await processor.processSiteMaterials(siteId);
    }
    
    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Embedding generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}

// Get processing status
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('user_id')
      .eq('id', siteId)
      .single();
    
    if (siteError || !site || site.user_id !== userId) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }
    
    // Get processing stats
    const processor = new ContentProcessor();
    const stats = await processor.getProcessingStats(siteId);
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Get processing status error:', error);
    return NextResponse.json(
      { error: 'Failed to get processing status' },
      { status: 500 }
    );
  }
}