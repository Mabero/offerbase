import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createSupabaseAdminClient()
    const { data: sites, error } = await supabase
      .from('sites')
      .select('id, name, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching sites:', error)
      return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 })
    }

    return NextResponse.json({ sites })
  } catch (error) {
    console.error('❌ Error in GET /api/sites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name } = await request.json()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Site name is required' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    
    // First ensure the user exists in the users table
    // Get user info from Clerk
    const { sessionClaims } = await auth()
    const userEmail = sessionClaims?.email as string || `${userId}@clerk.local`
    
    const { error: userError } = await supabase
      .from('users')
      .upsert([{
        id: userId,
        email: userEmail,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'id'
      })

    if (userError) {
      console.error('Error ensuring user exists:', userError)
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // Now create the site
    const { data: site, error } = await supabase
      .from('sites')
      .insert([{
        name: name.trim(),
        user_id: userId
      }])
      .select('id, name, created_at, updated_at')
      .single()

    if (error) {
      console.error('Error creating site:', error)
      return NextResponse.json({ error: 'Failed to create site' }, { status: 500 })
    }

    // Create default chat settings for the new site
    const { error: chatSettingsError } = await supabase
      .from('chat_settings')
      .insert([{
        site_id: site.id,
        chat_name: 'Affi',
        chat_color: '#000000',
        chat_name_color: '#FFFFFF',
        chat_bubble_icon_color: '#FFFFFF',
        input_placeholder: 'Type your message...',
        font_size: '14px',
        intro_message: 'Hello! How can I help you today?'
      }])

    if (chatSettingsError) {
      // Log the error but don't fail the site creation
      // The user can still configure chat settings later
      console.error('Error creating default chat settings:', chatSettingsError)
    }

    return NextResponse.json({ site }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/sites:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}