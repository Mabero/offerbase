import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

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

    const supabase = await createServerSupabaseClient()
    
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

    // Get training materials for this site
    const { data: materials, error } = await supabase
      .from('training_materials')
      .select('id, url, title, created_at, updated_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching training materials:', error)
      return NextResponse.json({ error: 'Failed to fetch training materials' }, { status: 500 })
    }

    return NextResponse.json({ materials })
  } catch (error) {
    console.error('Error in GET /api/training-materials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId, url } = await request.json()

    if (!siteId || !url) {
      return NextResponse.json({ error: 'Site ID and URL are required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    
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

    // Extract title from URL
    let title = url.trim()
    try {
      const urlObj = new URL(url)
      title = urlObj.hostname
    } catch {
      // If URL is invalid, use the original string
      title = url.trim()
    }

    // Create the training material
    const { data: material, error } = await supabase
      .from('training_materials')
      .insert([{
        site_id: siteId,
        url: url.trim(),
        title: title
      }])
      .select('id, url, title, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating training material:', error)
      return NextResponse.json({ error: 'Failed to create training material' }, { status: 500 })
    }

    return NextResponse.json({ material }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/training-materials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}