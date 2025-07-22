import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId } = await context.params
    const { name } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Site name is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First check if the site belongs to the user
    const { data: existingSite, error: checkError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (checkError || !existingSite) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Update the site
    const { data: site, error } = await supabase
      .from('sites')
      .update({ name: name.trim() })
      .eq('id', siteId)
      .eq('user_id', userId)
      .select('id, name, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error updating site:', error)
      return NextResponse.json({ error: 'Failed to update site' }, { status: 500 })
    }

    return NextResponse.json({ site })
  } catch (error) {
    console.error('Error in PATCH /api/sites/[siteId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ siteId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId } = await context.params
    const supabase = createSupabaseAdminClient()
    
    // First check if the site belongs to the user
    const { data: existingSite, error: checkError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (checkError || !existingSite) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Delete the site (cascade will handle related data)
    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', siteId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting site:', error)
      return NextResponse.json({ error: 'Failed to delete site' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Site deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/sites/[siteId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}