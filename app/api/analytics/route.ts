import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

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
    
    // Log the event (in production, this would go to a database)
    console.log('Analytics Event:', analyticsEvent);
    
    // In a real implementation, you would store this in a database
    // await storeAnalyticsEvent(analyticsEvent);
    
    return NextResponse.json({ 
      success: true, 
      event_id: analyticsEvent.id 
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
    await auth();
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
    
    // In a real implementation, you would fetch from a database
    const mockAnalytics = {
      site_id: siteId,
      period: {
        start: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: endDate || new Date().toISOString()
      },
      metrics: {
        total_widget_opens: 42,
        total_messages: 156,
        total_link_clicks: 23,
        unique_users: 38,
        average_session_duration: 145, // seconds
        bounce_rate: 0.32,
        conversion_rate: 0.15
      },
      events: [
        {
          id: 'evt_1',
          event_type: 'widget_open',
          timestamp: new Date().toISOString(),
          user_id: 'user_123',
          details: {}
        },
        {
          id: 'evt_2',
          event_type: 'message_sent',
          timestamp: new Date().toISOString(),
          user_id: 'user_123',
          details: { message_length: 25 }
        }
      ],
      popular_pages: [
        { url: 'https://example.com/', visits: 15 },
        { url: 'https://example.com/products', visits: 12 },
        { url: 'https://example.com/about', visits: 8 }
      ]
    };
    
    return NextResponse.json(mockAnalytics);
    
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