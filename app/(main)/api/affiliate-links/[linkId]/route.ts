import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import { cache, getCacheKey } from '@/lib/cache'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { linkId } = await context.params
    const { url, title, description, image_url, button_text } = await request.json()

    if (!url || !title) {
      return NextResponse.json({ error: 'URL and title are required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First verify the link belongs to the user (through site ownership)
    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .select(`
        id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', linkId)
      .eq('sites.user_id', userId)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Link not found or unauthorized' }, { status: 404 })
    }

    // Update the link
    const { data: updatedLink, error } = await supabase
      .from('affiliate_links')
      .update({
        url: url.trim(),
        title: title.trim(),
        description: description?.trim() || '',
        image_url: image_url?.trim() || null,
        button_text: button_text?.trim() || 'View Product',
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)
      .select('id, url, title, description, image_url, button_text, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error updating affiliate link:', error)
      return NextResponse.json({ error: 'Failed to update affiliate link' }, { status: 500 })
    }

    // Invalidate cache for affiliate links
    // We need to get the site_id from the link data
    const siteId = updatedLink.site_id;
    await cache.del(getCacheKey(siteId, 'affiliate_links'));
    console.log(`🗑️ Cache invalidated for affiliate links: ${siteId}`);

    return NextResponse.json({ link: updatedLink })
  } catch (error) {
    console.error('Error in PUT /api/affiliate-links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { linkId } = await context.params
    const supabase = createSupabaseAdminClient()
    
    // First verify the link belongs to the user (through site ownership)
    const { data: link, error: linkError } = await supabase
      .from('affiliate_links')
      .select(`
        id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', linkId)
      .eq('sites.user_id', userId)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Link not found or unauthorized' }, { status: 404 })
    }

    // Get site_id before deletion for cache invalidation
    const siteId = link.sites.id;

    // Delete the link
    const { error } = await supabase
      .from('affiliate_links')
      .delete()
      .eq('id', linkId)

    if (error) {
      console.error('Error deleting affiliate link:', error)
      return NextResponse.json({ error: 'Failed to delete affiliate link' }, { status: 500 })
    }

    // Invalidate cache for affiliate links
    await cache.del(getCacheKey(siteId, 'affiliate_links'));
    console.log(`🗑️ Cache invalidated for affiliate links: ${siteId}`);

    return NextResponse.json({ message: 'Link deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/affiliate-links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}