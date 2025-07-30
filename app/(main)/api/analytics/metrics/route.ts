import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';

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
      return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    
    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Default: 30 days
    const end = endDate || new Date().toISOString();
    
    // Get analytics events
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

    // Calculate session-based metrics
    const sessionMetrics = calculateSessionMetrics(events || [], sessions || []);
    
    // Calculate widget type metrics
    const widgetMetrics = calculateWidgetTypeMetrics(events || []);
    
    // Calculate conversion funnel
    const conversionMetrics = calculateConversionMetrics(events || [], sessions || []);
    
    // Calculate trend data (daily aggregates)
    const trendData = calculateTrendData(events || [], start, end);

    const metrics = {
      site_id: siteId,
      site_name: site.name,
      period: { start, end },
      overview: {
        total_sessions: sessionMetrics.totalSessions,
        total_messages: sessionMetrics.totalMessages,
        total_link_clicks: conversionMetrics.totalLinkClicks,
        total_offer_impressions: conversionMetrics.totalOfferImpressions,
        unique_users: sessionMetrics.uniqueUsers,
        conversion_rate: conversionMetrics.conversionRate,
        avg_messages_per_session: sessionMetrics.avgMessagesPerSession,
        avg_session_duration: sessionMetrics.avgSessionDuration
      },
      widget_performance: widgetMetrics,
      conversion_funnel: conversionMetrics,
      trends: trendData,
      top_offers: calculateTopOffers(events || [])
    };
    
    return NextResponse.json(metrics);
    
  } catch (error) {
    console.error('Analytics metrics API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface AnalyticsEvent {
  event_type: string;
  user_session_id: string;
  event_data?: {
    widget_type?: string;
    session_id?: string;
    session_duration?: number;
    link_url?: string;
    link_name?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

interface ChatSession {
  id: string;
  message_count: number;
  started_at: string;
  ended_at?: string;
}

function calculateSessionMetrics(events: AnalyticsEvent[], sessions: ChatSession[]) {
  const totalSessions = sessions.length;
  const totalMessages = sessions.reduce((sum, session) => sum + (session.message_count || 0), 0);
  const uniqueUsers = new Set(events.map(e => e.user_session_id)).size;
  
  // Calculate average session duration from session_start/session_end events
  const sessionStarts = events.filter(e => e.event_type === 'session_start');
  const sessionEnds = events.filter(e => e.event_type === 'session_end');
  
  const durations = sessionEnds
    .map(endEvent => {
      const startEvent = sessionStarts.find(s => 
        s.event_data?.session_id === endEvent.event_data?.session_id
      );
      if (startEvent && endEvent.event_data?.session_duration) {
        return endEvent.event_data.session_duration;
      }
      return null;
    })
    .filter(d => d !== null);
  
  const avgSessionDuration = durations.length > 0 
    ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length / 1000) // Convert to seconds
    : 0;

  return {
    totalSessions,
    totalMessages,
    uniqueUsers,
    avgMessagesPerSession: totalSessions > 0 ? Math.round((totalMessages / totalSessions) * 10) / 10 : 0,
    avgSessionDuration
  };
}

function calculateWidgetTypeMetrics(events: AnalyticsEvent[]) {
  const floatingEvents = events.filter(e => e.event_data?.widget_type === 'floating');
  const inlineEvents = events.filter(e => e.event_data?.widget_type === 'inline');
  
  const floatingOpens = floatingEvents.filter(e => e.event_type === 'widget_open').length;
  const inlineLoads = inlineEvents.filter(e => e.event_type === 'inline_widget_loaded').length;
  const floatingClicks = floatingEvents.filter(e => e.event_type === 'link_click').length;
  const inlineClicks = inlineEvents.filter(e => e.event_type === 'link_click').length;
  
  return {
    floating: {
      opens: floatingOpens,
      clicks: floatingClicks,
      conversion_rate: floatingOpens > 0 ? Math.round((floatingClicks / floatingOpens) * 1000) / 10 : 0, // Percentage with 1 decimal
      engagement_rate: floatingOpens > 0 ? Math.round((floatingOpens / (floatingOpens + inlineLoads)) * 1000) / 10 : 0
    },
    inline: {
      loads: inlineLoads,
      clicks: inlineClicks,
      conversion_rate: inlineLoads > 0 ? Math.round((inlineClicks / inlineLoads) * 1000) / 10 : 0,
      engagement_rate: inlineLoads > 0 ? Math.round((inlineLoads / (floatingOpens + inlineLoads)) * 1000) / 10 : 0
    }
  };
}

function calculateConversionMetrics(events: AnalyticsEvent[], sessions: ChatSession[]) {
  const totalSessions = sessions.length;
  const sessionStarts = events.filter(e => e.event_type === 'session_start').length;
  const offerImpressions = events.filter(e => e.event_type === 'offer_impression').length;
  const linkClicks = events.filter(e => e.event_type === 'link_click').length;
  
  // Calculate sessions that led to clicks
  const sessionsWithClicks = new Set(
    events.filter(e => e.event_type === 'link_click')
      .map(e => e.event_data?.session_id)
      .filter(Boolean)
  ).size;
  
  return {
    totalOfferImpressions: offerImpressions,
    totalLinkClicks: linkClicks,
    conversionRate: totalSessions > 0 ? Math.round((sessionsWithClicks / totalSessions) * 1000) / 10 : 0,
    impressionToClickRate: offerImpressions > 0 ? Math.round((linkClicks / offerImpressions) * 1000) / 10 : 0,
    funnel: {
      session_starts: sessionStarts,
      offer_impressions: offerImpressions,
      link_clicks: linkClicks,
      sessions_with_clicks: sessionsWithClicks
    }
  };
}

function calculateTrendData(events: AnalyticsEvent[], start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const dayInMs = 24 * 60 * 60 * 1000;
  
  const trends = [];
  
  for (let date = new Date(startDate); date <= endDate; date.setTime(date.getTime() + dayInMs)) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);  
    dayEnd.setHours(23, 59, 59, 999);
    
    const dayEvents = events.filter(e => {
      const eventDate = new Date(e.created_at);
      return eventDate >= dayStart && eventDate <= dayEnd;
    });
    
    trends.push({
      date: dayStart.toISOString().split('T')[0],
      sessions: dayEvents.filter(e => e.event_type === 'session_start').length,
      impressions: dayEvents.filter(e => e.event_type === 'offer_impression').length,
      clicks: dayEvents.filter(e => e.event_type === 'link_click').length,
      widget_opens: dayEvents.filter(e => e.event_type === 'widget_open').length
    });
  }
  
  return trends;
}

function calculateTopOffers(events: AnalyticsEvent[]) {
  const linkClicks = events.filter(e => e.event_type === 'link_click');
  const offerImpressions = events.filter(e => e.event_type === 'offer_impression');
  
  // Group by offer URL
  interface OfferStat {
    name?: string;
    url: string;
    clicks: number;
    impressions: number;
  }
  
  const offerStats: Record<string, OfferStat> = {};
  
  linkClicks.forEach(event => {
    const url = event.event_data?.link_url;
    const name = event.event_data?.link_name;
    if (url) {
      if (!offerStats[url]) {
        offerStats[url] = { name, url, clicks: 0, impressions: 0 };
      }
      offerStats[url].clicks++;
    }
  });
  
  offerImpressions.forEach(event => {
    const url = event.event_data?.link_url;
    if (url && offerStats[url]) {
      offerStats[url].impressions++;
    }
  });
  
  // Calculate click-through rates and sort by clicks
  return Object.values(offerStats)
    .map((offer) => ({
      ...offer,
      click_through_rate: offer.impressions > 0 ? Math.round((offer.clicks / offer.impressions) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10); // Top 10 offers
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}