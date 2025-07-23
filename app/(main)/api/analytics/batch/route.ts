import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

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
      const event = events[i];
      
      if (!event.event_type || !event.site_id) {
        errors.push(`Event ${i}: event_type and site_id are required`);
        continue;
      }
      
      validEvents.push({
        site_id: event.site_id,
        event_type: event.event_type,
        user_session_id: event.user_id || getSessionId(request),
        user_agent: event.user_agent,
        ip_address: event.ip_address || getClientIP(request),
        event_data: event.details || {}
      });
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
    const supabase = createSupabaseAdminClient();
    
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