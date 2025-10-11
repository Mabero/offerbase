import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    const body = await request.json();
    
    const { 
      event_type, 
      site_id, 
      user_id, 
      user_session_id,
      session_id,
      page_url,
      widget_type,
      route_mode,
      refusal_reason,
      page_context_used,
      request_id,
      details = {},
      timestamp,
      url,
      user_agent
    } = body;
    
    // Validate required fields
    if (!event_type || !site_id) {
      return NextResponse.json(
        { error: 'event_type and site_id are required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
          }
        }
      );
    }
    
    // Store the event in the database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    
    const { data: event, error } = await supabase
      .from('analytics_events')
      .insert([{
        site_id: site_id,
        event_type,
        user_session_id: user_session_id || user_id || getSessionId(request),
        session_id: session_id || null,
        page_url: page_url || url || null,
        widget_type: widget_type || (details?.widget_type ?? null),
        route_mode: route_mode || null,
        refusal_reason: refusal_reason || null,
        page_context_used: page_context_used || null,
        request_id: request_id || null,
        user_agent,
        ip_address: getClientIP(request),
        event_data: details
      }])
      .select('id')
      .single();
    
    if (error) {
      console.error('Error storing analytics event:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json(
        { 
          error: 'Failed to store analytics event',
          details: process.env.NODE_ENV === 'development' ? error.message : 'Check server logs'
        },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
          }
        }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      event_id: event.id 
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
      }
    });
    
  } catch (error) {
    console.error('Analytics API error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // If it's a database connection or schema issue, provide a graceful fallback
    const errorMessage = error instanceof Error && error.message.includes('relation "analytics_events" does not exist')
      ? 'Analytics table not configured - contact administrator'
      : 'Internal server error';
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'Check server logs'
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
        }
      }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { 
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
        }
      });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    if (!siteId) {
      return NextResponse.json(
        { error: 'site_id is required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
          }
        }
      );
    }

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
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
        }
      });
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
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
        }
      });
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

    // Calculate metrics with widget type breakdown
    const widgetOpens = events?.filter(e => e.event_type === 'widget_open').length || 0;
    const linkClicks = events?.filter(e => e.event_type === 'link_click').length || 0;
    const offerImpressions = events?.filter(e => e.event_type === 'offer_impression').length || 0;
    const sessionStarts = events?.filter(e => e.event_type === 'session_start').length || 0;
    const totalMessages = sessions?.reduce((sum, session) => sum + (session.message_count || 0), 0) || 0;
    const uniqueUsers = new Set(events?.map(e => e.user_session_id)).size || 0;
    const totalSessions = sessions?.length || 0;

    // Widget type breakdown
    const floatingWidgetEvents = events?.filter(e => e.event_data?.widget_type === 'floating') || [];
    const inlineWidgetEvents = events?.filter(e => e.event_data?.widget_type === 'inline') || [];
    const sidebarWidgetEvents = events?.filter(e => e.event_data?.widget_type === 'sidebar') || [];
    
    const floatingOpens = floatingWidgetEvents.filter(e => e.event_type === 'widget_open').length;
    const inlineOpens = inlineWidgetEvents.filter(e => e.event_type === 'widget_open').length;
    const sidebarOpens = sidebarWidgetEvents.filter(e => e.event_type === 'widget_open').length;
    const floatingClicks = floatingWidgetEvents.filter(e => e.event_type === 'link_click').length;
    const inlineClicks = inlineWidgetEvents.filter(e => e.event_type === 'link_click').length;
    const sidebarClicks = sidebarWidgetEvents.filter(e => e.event_type === 'link_click').length;
    
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
        total_offer_impressions: offerImpressions,
        total_session_starts: sessionStarts,
        unique_users: uniqueUsers,
        total_sessions: totalSessions,
        average_session_duration: Math.round(averageSessionDuration),
        bounce_rate: totalSessions > 0 ? (sessionsWithDuration.filter(s => s.message_count === 0).length / totalSessions) : 0,
        conversion_rate: totalSessions > 0 ? (linkClicks / totalSessions) : 0,
        impression_to_click_rate: offerImpressions > 0 ? (linkClicks / offerImpressions) : 0,
        // Widget type breakdown
        widget_breakdown: {
          floating: {
            opens: floatingOpens,
            clicks: floatingClicks,
            conversion_rate: floatingOpens > 0 ? (floatingClicks / floatingOpens) : 0
          },
          inline: {
            opens: inlineOpens,
            clicks: inlineClicks,
            conversion_rate: inlineOpens > 0 ? (inlineClicks / inlineOpens) : 0
          },
          sidebar: {
            opens: sidebarOpens,
            clicks: sidebarClicks,
            conversion_rate: sidebarOpens > 0 ? (sidebarClicks / sidebarOpens) : 0
          }
        }
      },
      recent_events: events?.slice(0, 10) || []
    };
    
    return NextResponse.json(analytics, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
      }
    });
    
  } catch (error) {
    console.error('Analytics GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
        }
      }
    );
  }
}

function generateEventId(): string {
  return 'evt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function isValidIP(ip?: string | null): boolean {
  if (!ip) return false;
  const v4 = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const v6 = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
  return v4.test(ip) || v6.test(ip);
}

function getClientIP(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const candidate = forwarded ? forwarded.split(',')[0].trim() : (realIP || '').trim();
  return isValidIP(candidate) ? candidate : null;
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
