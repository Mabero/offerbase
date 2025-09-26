import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { 
        status: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get('siteId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // First verify the site belongs to the user
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    // Get chat sessions for this site with message counts
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        user_session_id,
        started_at,
        ended_at,
        message_count,
        user_agent,
        is_active,
        last_activity_at
      `)
      .eq('site_id', siteId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching chat sessions:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      
      // Check if it's a missing table error
      const errorMessage = error.message.includes('relation "chat_sessions" does not exist')
        ? 'Chat sessions table not configured - please run database migration'
        : 'Failed to fetch chat sessions'
      
      return NextResponse.json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : 'Check server logs'
      }, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    // Aggregate offer impressions and clicks per session (prefer session_id to avoid cross-session mixing)
    let sessionsWithAgg = sessions || [];
    try {
      const sessionIds = (sessions || []).map((s: any) => s.id).filter((k: string) => !!k);
      if (sessionIds.length) {
        const { data: evs } = await supabase
          .from('analytics_events')
          .select('session_id, event_type, created_at')
          .eq('site_id', siteId)
          .in('session_id', sessionIds)
          .in('event_type', ['offer_impression', 'link_click'])
          .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());
        const aggBySession: Record<string, { offers: number; clicks: number; last_click_at: string | null }> = {};
        (evs || []).forEach((e: any) => {
          const k = e.session_id || '';
          if (!aggBySession[k]) aggBySession[k] = { offers: 0, clicks: 0, last_click_at: null };
          if (e.event_type === 'offer_impression') aggBySession[k].offers++;
          if (e.event_type === 'link_click') {
            aggBySession[k].clicks++;
            if (!aggBySession[k].last_click_at || new Date(e.created_at) > new Date(aggBySession[k].last_click_at!)) {
              aggBySession[k].last_click_at = e.created_at;
            }
          }
        });
        sessionsWithAgg = (sessions || []).map((s: any) => {
          const a = aggBySession[s.id] || { offers: 0, clicks: 0, last_click_at: null };
          return {
            ...s,
            offers_shown: a.offers,
            link_clicks: a.clicks,
            clicked: a.clicks > 0,
            last_click_at: a.last_click_at
          };
        });
      }
    } catch (e) {
      // If aggregation fails, default to zeros
      sessionsWithAgg = (sessions || []).map((s: any) => ({ ...s, offers_shown: 0, link_clicks: 0, clicked: false, last_click_at: null }));
    }

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)

    if (countError) {
      console.error('Error getting session count:', countError)
    }

    return NextResponse.json({ 
      sessions: sessionsWithAgg,
      total: count || 0,
      limit,
      offset
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    console.error('Error in GET /api/chat-sessions:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'Check server logs'
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { siteId, userSessionId, userAgent, ipAddress } = await request.json()

    if (!siteId || !userSessionId) {
      return NextResponse.json({ error: 'Site ID and user session ID are required' }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Create a new chat session
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert([{
        site_id: siteId,
        user_session_id: userSessionId,
        user_agent: userAgent,
        ip_address: ipAddress
      }])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating chat session:', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({ 
        error: 'Failed to create chat session',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Check server logs'
      }, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      })
    }

    return NextResponse.json({ session }, { 
      status: 201,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    console.error('Error in POST /api/chat-sessions:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : 'Check server logs'
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
