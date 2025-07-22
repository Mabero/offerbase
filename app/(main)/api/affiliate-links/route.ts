import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Get affiliate links for this site
    const { data: links, error } = await supabase
      .from('affiliate_links')
      .select('id, url, title, description, created_at, updated_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching affiliate links:', error)
      return NextResponse.json({ error: 'Failed to fetch affiliate links' }, { status: 500 })
    }

    return NextResponse.json({ links })
  } catch (error) {
    console.error('Error in GET /api/affiliate-links:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId, url, title, description } = await request.json()

    if (!siteId || !url || !title) {
      return NextResponse.json({ error: 'Site ID, URL, and title are required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Create the affiliate link
    const { data: link, error } = await supabase
      .from('affiliate_links')
      .insert([{
        site_id: siteId,
        url: url.trim(),
        title: title.trim(),
        description: description?.trim() || ''
      }])
      .select('id, url, title, description, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating affiliate link:', error)
      return NextResponse.json({ error: 'Failed to create affiliate link' }, { status: 500 })
    }

    return NextResponse.json({ link }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/affiliate-links:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}