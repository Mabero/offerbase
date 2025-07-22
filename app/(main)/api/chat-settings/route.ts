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

    const body = await request.json()
    const { siteId, ...settings } = body

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 })
    }

    console.log('PUT chat-settings request:', { siteId, userId, settings })

    const supabase = createSupabaseAdminClient()
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError) {
      console.error('Site verification error:', siteError)
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    if (!site) {
      console.error('Site not found for user:', { siteId, userId })
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 })
    }

    // Check if chat settings already exist for this site
    const { data: existingSettings, error: checkError } = await supabase
      .from('chat_settings')
      .select('id')
      .eq('site_id', siteId)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing settings:', checkError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    let result;
    const settingsData = {
      ...settings,
      site_id: siteId,
      updated_at: new Date().toISOString()
    }

    if (existingSettings) {
      // Update existing settings
      const { data: updatedSettings, error: updateError } = await supabase
        .from('chat_settings')
        .update(settingsData)
        .eq('site_id', siteId)
        .select('*')
        .single()

      if (updateError) {
        console.error('Error updating chat settings:', updateError)
        return NextResponse.json({ error: 'Failed to update chat settings' }, { status: 500 })
      }

      result = updatedSettings
    } else {
      // Insert new settings
      const { data: newSettings, error: insertError } = await supabase
        .from('chat_settings')
        .insert({
          ...settingsData,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single()

      if (insertError) {
        console.error('Error inserting chat settings:', insertError)
        return NextResponse.json({ error: 'Failed to create chat settings' }, { status: 500 })
      }

      result = newSettings
    }

    console.log('Chat settings operation successful:', result)
    return NextResponse.json({ settings: result })
    
  } catch (error) {
    console.error('Error in PUT /api/chat-settings:', error)
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}