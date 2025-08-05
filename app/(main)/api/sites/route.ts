import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// GET /api/sites - Fetch sites for authenticated user
export async function GET(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Query sites
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Sites query error:', error);
      return NextResponse.json({ error: 'Failed to fetch sites', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });

  } catch (error) {
    console.error('Sites API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { name } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: 'Site name is required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Insert new site
    const { data, error } = await supabase
      .from('sites')
      .insert([{ name: name.trim(), user_id: userId }])
      .select('id, name, created_at, updated_at')
      .single();

    if (error) {
      console.error('Site creation error:', error);
      return NextResponse.json({ error: 'Failed to create site', details: error }, { status: 500 });
    }

    // Create default chat settings for the new site (optional, non-blocking)
    try {
      await supabase
        .from('chat_settings')
        .insert([{
          site_id: data.id,
          chat_name: 'Affi',
          chat_color: '#000000',
          chat_name_color: '#FFFFFF',
          chat_bubble_icon_color: '#FFFFFF',
          input_placeholder: 'Type your message...',
          font_size: '14px',
          intro_message: 'Hello! How can I help you today?'
        }]);
    } catch (error) {
      // Log but don't fail the site creation
      console.error('Error creating default chat settings:', error);
    }

    return NextResponse.json({ success: true, data }, { status: 201 });

  } catch (error) {
    console.error('Sites API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}