import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// PUT /api/affiliate-links/[linkId] - Update affiliate link
export async function PUT(request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get the params
    const { linkId } = await params;

    // Parse request body
    const body = await request.json();
    const { url, title, description, image_url, button_text } = body;

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First verify ownership and get site_id
    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .select(`
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', linkId)
      .eq('sites.user_id', userId)
      .single();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Link not found or unauthorized' }, { status: 404 });
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (url !== undefined) updateData.url = url.trim();
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || '';
    if (image_url !== undefined) updateData.image_url = image_url?.trim() || null;
    if (button_text !== undefined) updateData.button_text = button_text?.trim() || 'View Product';

    // Update the link
    const { data, error } = await supabase
      .from('affiliate_links')
      .update(updateData)
      .eq('id', linkId)
      .select('id, url, title, description, image_url, button_text, created_at, updated_at')
      .single();

    if (error) {
      console.error('Affiliate link update error:', error);
      return NextResponse.json({ error: 'Failed to update affiliate link', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Affiliate links API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// DELETE /api/affiliate-links/[linkId] - Delete affiliate link
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ linkId: string }> }) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get the params
    const { linkId } = await params;

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // First verify ownership
    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .select(`
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', linkId)
      .eq('sites.user_id', userId)
      .single();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Link not found or unauthorized' }, { status: 404 });
    }

    // Delete the link
    const { error } = await supabase
      .from('affiliate_links')
      .delete()
      .eq('id', linkId);

    if (error) {
      console.error('Affiliate link deletion error:', error);
      return NextResponse.json({ error: 'Failed to delete affiliate link', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Affiliate link deleted successfully' });

  } catch (error) {
    console.error('Affiliate links API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}