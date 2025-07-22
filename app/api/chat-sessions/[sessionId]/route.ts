import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await context.params
    const supabase = createSupabaseAdminClient()
    
    // Get the chat session with messages and verify ownership
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', sessionId)
      .eq('sites.user_id', userId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found or unauthorized' }, { status: 404 })
    }

    // Get messages for this session
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_session_id', sessionId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching chat messages:', messagesError)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return NextResponse.json({ 
      session: {
        ...session,
        sites: undefined // Remove the sites data from response
      },
      messages: messages || []
    })
  } catch (error) {
    console.error('Error in GET /api/chat-sessions/[sessionId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params
    const { ended_at, is_active } = await request.json()

    const supabase = createSupabaseAdminClient()
    
    // Update the chat session
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .update({
        ended_at,
        is_active,
        last_activity_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating chat session:', error)
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Error in PUT /api/chat-sessions/[sessionId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}