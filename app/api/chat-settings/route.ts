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

    // Get chat settings for this site
    const { data: settings, error } = await supabase
      .from('chat_settings')
      .select('*')
      .eq('site_id', siteId)
      .single()

    if (error) {
      // If no settings found (PGRST116 is "not found" error), return default settings
      if (error.code === 'PGRST116') {
        const defaultSettings = {
          id: null,
          site_id: siteId,
          chat_name: 'Affi',
          chat_color: '#000000',
          chat_icon_url: null,
          chat_name_color: '#FFFFFF',
          chat_bubble_icon_color: '#FFFFFF',
          input_placeholder: 'Type your message...',
          font_size: '14px',
          intro_message: 'Hello! How can I help you today?',
          instructions: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        return NextResponse.json({ settings: defaultSettings })
      }
      
      console.error('Error fetching chat settings:', error)
      return NextResponse.json({ error: 'Failed to fetch chat settings' }, { status: 500 })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Error in GET /api/chat-settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { siteId, ...settings } = await request.json()

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

    // Update chat settings for this site
    const { data: updatedSettings, error } = await supabase
      .from('chat_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('site_id', siteId)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating chat settings:', error)
      return NextResponse.json({ error: 'Failed to update chat settings' }, { status: 500 })
    }

    return NextResponse.json({ settings: updatedSettings })
  } catch (error) {
    console.error('Error in PUT /api/chat-settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}