import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Fetch chat settings for the given siteId
    const { data: chatSettings, error } = await supabase
      .from('chat_settings')
      .select('*')
      .eq('site_id', siteId)
      .single();

    if (error) {
      console.error('Error fetching chat settings:', error);
      // Return default settings if not found
      return NextResponse.json({
        chat_name: 'Affi',
        chat_color: '#000000',
        chat_icon_url: '',
        chat_name_color: '#FFFFFF',
        chat_bubble_icon_color: '#FFFFFF',
        input_placeholder: 'Type your message...',
        font_size: '14px',
        intro_message: 'Hello! How can I help you today?'
      });
    }

    return NextResponse.json(chatSettings);
  } catch (error) {
    console.error('Error in widget-settings API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}