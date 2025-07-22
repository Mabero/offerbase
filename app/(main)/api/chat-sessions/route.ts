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
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

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

    // Get chat sessions for this site with message counts
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_session_id,
        started_at,
        ended_at,
        message_count,
        user_agent,
        is_active,
        last_activity_at
      `)
      .eq('site_id', siteId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching chat sessions:', error)
      return NextResponse.json({ error: 'Failed to fetch chat sessions' }, { status: 500 })
    }

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)

    if (countError) {
      console.error('Error getting session count:', countError)
    }

    return NextResponse.json({ 
      sessions: sessions || [],
      total: count || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error in GET /api/chat-sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { siteId, userSessionId, userAgent, ipAddress } = await request.json()

    if (!siteId || !userSessionId) {
      return NextResponse.json({ error: 'Site ID and user session ID are required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // Create a new chat session
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert([{
        site_id: siteId,
        user_session_id: userSessionId,
        user_agent: userAgent,
        ip_address: ipAddress
      }])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating chat session:', error)
      return NextResponse.json({ error: 'Failed to create chat session' }, { status: 500 })
    }

    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/chat-sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}