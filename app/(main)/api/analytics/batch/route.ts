import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { events } = body;
    
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'events array is required' },
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
    
    console.log('Analytics Batch API: Processing', events.length, 'events');
    
    // Validate and prepare events for database insertion
    const validEvents = [];
    const errors = [];
    
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev?.event_type || !ev?.site_id) {
        errors.push(`Event ${i}: event_type and site_id are required`);
        continue;
      }

      const mapped = {
        site_id: ev.site_id,
        event_type: ev.event_type,
        user_session_id: ev.user_session_id || ev.user_id || (ev.details && ev.details.session_id) || getSessionId(request),
        session_id: ev.session_id || null,
        page_url: ev.page_url || ev.url || null,
        widget_type: ev.widget_type || (ev.details && ev.details.widget_type) || null,
        route_mode: ev.route_mode || null,
        refusal_reason: ev.refusal_reason || null,
        page_context_used: ev.page_context_used || null,
        request_id: ev.request_id || null,
        user_agent: ev.user_agent,
        ip_address: ev.ip_address || getClientIP(request),
        event_data: ev.details || {}
      };
      validEvents.push(mapped);
    }
    
    if (validEvents.length === 0) {
      return NextResponse.json(
        { 
          error: 'No valid events to process',
          details: errors
        },
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
    
    // Insert events in batch
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: 'public' } }
    );
    
    const { data: insertedEvents, error } = await supabase
      .from('analytics_events')
      .insert(validEvents)
      .select('id');
    
    if (error) {
      console.error('Error storing analytics events batch:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        eventsCount: validEvents.length
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to store analytics events',
          details: process.env.NODE_ENV === 'development' ? error.message : 'Check server logs',
          processed: 0,
          failed: validEvents.length
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
    
    console.log('Analytics Batch API: Successfully stored', insertedEvents?.length || 0, 'events');
    
    return NextResponse.json({ 
      success: true,
      processed: insertedEvents?.length || 0,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-site-id, x-user-id, x-session-id',
      }
    });
    
  } catch (error) {
    console.error('Analytics Batch API error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Provide specific error messages for common issues
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
