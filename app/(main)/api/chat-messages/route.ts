import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { chatSessionId, role, content } = await request.json()

    if (!chatSessionId || !role || !content) {
      return NextResponse.json({ 
        error: 'Chat session ID, role, and content are required' 
      }, { status: 400 })
    }

    if (!['user', 'assistant'].includes(role)) {
      return NextResponse.json({ 
        error: 'Role must be either "user" or "assistant"' 
      }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // Verify the chat session exists
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', chatSessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 })
    }

    // Create the message
    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert([{
        chat_session_id: chatSessionId,
        role,
        content
      }])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating chat message:', error)
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/chat-messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}