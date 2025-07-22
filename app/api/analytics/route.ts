import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const body = await request.json();
    
    const { 
      event_type, 
      site_id, 
      user_id, 
      details = {},
      timestamp,
      url,
      user_agent
    } = body;
    
    // Validate required fields
    if (!event_type || !site_id) {
      return NextResponse.json(
        { error: 'event_type and site_id are required' },
        { status: 400 }
      );
    }
    
    // Create analytics event
    const analyticsEvent = {
      id: generateEventId(),
      event_type,
      site_id,
      user_id: user_id || userId,
      details,
      timestamp: timestamp || new Date().toISOString(),
      url,
      user_agent,
      ip_address: getClientIP(request),
      session_id: getSessionId(request)
    };
    
    // Store the event in the database
    const supabase = createSupabaseAdminClient();
    
    const { data: event, error } = await supabase
      .from('analytics_events')
      .insert([{
        site_id: site_id,
        event_type,
        user_session_id: user_id || getSessionId(request),
        user_agent,
        ip_address: getClientIP(request),
        event_data: details
      }])
      .select('id')
      .single();
    
    if (error) {
      console.error('Error storing analytics event:', error);
      return NextResponse.json(
        { error: 'Failed to store analytics event' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      event_id: event.id 
    });
    
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    if (!siteId) {
      return NextResponse.json(
        { error: 'site_id is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    
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

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();
    
    // Get analytics metrics
    const { data: events, error: eventsError } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('site_id', siteId)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('Error fetching analytics events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    // Get chat sessions for the period
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('site_id', siteId)
      .gte('started_at', start)
      .lte('started_at', end);

    if (sessionsError) {
      console.error('Error fetching chat sessions:', sessionsError);
    }

    // Calculate metrics
    const widgetOpens = events?.filter(e => e.event_type === 'widget_open').length || 0;
    const linkClicks = events?.filter(e => e.event_type === 'link_click').length || 0;
    const totalMessages = sessions?.reduce((sum, session) => sum + (session.message_count || 0), 0) || 0;
    const uniqueUsers = new Set(events?.map(e => e.user_session_id)).size || 0;
    const totalSessions = sessions?.length || 0;
    
    // Calculate average session duration
    const sessionsWithDuration = sessions?.filter(s => s.ended_at) || [];
    const averageSessionDuration = sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce((sum, session) => {
          const duration = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
          return sum + (duration / 1000); // Convert to seconds
        }, 0) / sessionsWithDuration.length
      : 0;

    const analytics = {
      site_id: siteId,
      period: { start, end },
      metrics: {
        total_widget_opens: widgetOpens,
        total_messages: totalMessages,
        total_link_clicks: linkClicks,
        unique_users: uniqueUsers,
        total_sessions: totalSessions,
        average_session_duration: Math.round(averageSessionDuration),
        bounce_rate: totalSessions > 0 ? (sessionsWithDuration.filter(s => s.message_count === 0).length / totalSessions) : 0,
        conversion_rate: totalSessions > 0 ? (linkClicks / totalSessions) : 0
      },
      recent_events: events?.slice(0, 10) || []
    };
    
    return NextResponse.json(analytics);
    
  } catch (error) {
    console.error('Analytics GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateEventId(): string {
  return 'evt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0];
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

function getSessionId(request: NextRequest): string {
  const sessionId = request.headers.get('x-session-id');
  return sessionId || 'session_' + Date.now().toString(36);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
    },
  });
}