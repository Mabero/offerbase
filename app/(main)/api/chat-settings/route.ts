import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Default chat settings
const DEFAULT_SETTINGS = {
  id: null,
  chat_name: 'Affi',
  chat_color: '#000000',
  chat_icon_url: null,
  chat_name_color: '#FFFFFF',
  chat_bubble_icon_color: '#FFFFFF',
  input_placeholder: 'Type your message...',
  font_size: '14px',
  intro_message: 'Hello! How can I help you today?',
  instructions: null,
  preferred_language: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// GET /api/chat-settings - Fetch chat settings for a site
export async function GET(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get siteId from query params
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Fetch chat settings
    const { data, error } = await supabase
      .from('chat_settings')
      .select('*')
      .eq('site_id', siteId)
      .single();

    // If no settings found, return default settings
    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ 
        success: true, 
        data: {
          ...DEFAULT_SETTINGS,
          site_id: siteId
        }
      });
    }

    if (error) {
      console.error('Chat settings query error:', error);
      return NextResponse.json({ error: 'Failed to fetch chat settings', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Chat settings API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

// PUT /api/chat-settings - Update chat settings for a site
export async function PUT(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { siteId, ...settingsData } = body;
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Check if settings exist
    const { data: existingSettings, error: checkError } = await supabase
      .from('chat_settings')
      .select('id')
      .eq('site_id', siteId)
      .maybeSingle();

    if (checkError) {
      console.error('Settings check error:', checkError);
      return NextResponse.json({ error: 'Failed to check existing settings', details: checkError }, { status: 500 });
    }

    const settingsDataWithMeta = {
      ...settingsData,
      site_id: siteId,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existingSettings) {
      // Update existing settings
      const { data, error } = await supabase
        .from('chat_settings')
        .update(settingsDataWithMeta)
        .eq('site_id', siteId)
        .select('*')
        .single();

      if (error) {
        console.error('Settings update error:', error);
        return NextResponse.json({ error: 'Failed to update chat settings', details: error }, { status: 500 });
      }
      result = data;
    } else {
      // Insert new settings
      const { data, error } = await supabase
        .from('chat_settings')
        .insert({
          ...settingsDataWithMeta,
          created_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (error) {
        console.error('Settings creation error:', error);
        return NextResponse.json({ error: 'Failed to create chat settings', details: error }, { status: 500 });
      }
      result = data;
    }

    return NextResponse.json({ success: true, data: result });

  } catch (error) {
    console.error('Chat settings API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}