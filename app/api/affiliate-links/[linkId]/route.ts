import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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
    const supabase = await createServerSupabaseClient()
    
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

    // Delete the link
    const { error } = await supabase
      .from('affiliate_links')
      .delete()
      .eq('id', linkId)

    if (error) {
      console.error('Error deleting affiliate link:', error)
      return NextResponse.json({ error: 'Failed to delete affiliate link' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Link deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/affiliate-links/[linkId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}