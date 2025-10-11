import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('site_id');
    const debugFlag = searchParams.get('debug') === '1';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    if (!siteId) {
      return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { db: { schema: 'public' } }
    );
    const allowAll = process.env.DEV_ALLOW_ALL_SITES === 'true' && process.env.NODE_ENV !== 'production';
    const allowUnowned = process.env.ANALYTICS_ALLOW_UNOWNED === 'true';
    const DEBUG_ANALYTICS = process.env.ANALYTICS_DEBUG === '1' || debugFlag;

    // Always fetch the site by id so we can surface ownership mismatches clearly
    const byId = await supabase
      .from('sites')
      .select('id, name, user_id')
      .eq('id', siteId)
      .maybeSingle();

    if (byId.error) {
      if (DEBUG_ANALYTICS) {
        console.error('[Analytics] site lookup failed', { siteId, error: byId.error.message });
      }
      return NextResponse.json({ error: 'Site lookup failed' }, { status: 500 });
    }

    // If site exists and owner differs, return detailed 404 in debug mode (or bypass if allowed)
    if (byId.data && byId.data.user_id !== userId && !allowUnowned && !allowAll) {
      const payload: any = { error: 'Site not found or unauthorized', site_id: siteId, user_id: userId };
      if (debugFlag) {
        payload.owner_from_db = byId.data.user_id;
        payload.reason = 'owner_mismatch';
      }
      if (DEBUG_ANALYTICS) {
        console.warn('[Analytics] owner mismatch', { siteId, clerk_user: userId, db_owner: byId.data.user_id });
      }
      return NextResponse.json(payload, { status: 404 });
    }

    // Determine `site` for downstream logic respecting bypass/dev flags
    let site: any = null;
    if (allowUnowned) {
      site = byId.data || { id: siteId, name: 'Unknown site (bypass)' };
    } else if (allowAll) {
      site = byId.data || { id: siteId, name: 'Unknown site (dev bypass)' };
    } else {
      // Strict ownership check (production, no bypass)
      const owned = await supabase
        .from('sites')
        .select('id, name')
        .eq('id', siteId)
        .eq('user_id', userId)
        .single();
      if (owned.error || !owned.data) {
        const payload: any = { error: 'Site not found or unauthorized', site_id: siteId, user_id: userId };
        if (debugFlag && byId.data?.user_id) payload.owner_from_db = byId.data.user_id;
        return NextResponse.json(payload, { status: 404 });
      }
      site = owned.data;
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
      if (allowAll) {
        // Try to return offers list with zeros so UI still shows offers
        let offersZero: any[] = [];
        let offersCount = 0;
        try {
          const { data: offers } = await supabase
            .from('affiliate_links')
            .select('id, title, url')
            .eq('site_id', siteId);
          offersCount = (offers || []).length;
          offersZero = (offers || []).map((o: any) => ({
            id: o.id,
            title: o.title,
            url: o.url,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            last_seen: null,
          }));
        } catch {}

        const metrics = {
          site_id: siteId,
          site_name: site.name,
          period: { start, end },
          overview: {
            total_sessions: 0,
            total_messages: 0,
            total_link_clicks: 0,
            total_offer_impressions: 0,
            unique_users: 0,
            conversion_rate: 0,
            avg_messages_per_session: 0,
            avg_session_duration: 0,
          },
          widget_performance: { floating: { opens: 0, clicks: 0, conversion_rate: 0, engagement_rate: 0 }, inline: { loads: 0, clicks: 0, conversion_rate: 0, engagement_rate: 0 } },
          conversion_funnel: { totalOfferImpressions: 0, totalLinkClicks: 0, conversionRate: 0, impressionToClickRate: 0, funnel: { session_starts: 0, offer_impressions: 0, link_clicks: 0, sessions_with_clicks: 0 } },
          trends: [],
          top_offers: [],
          offers_performance: offersZero,
          top_pages: [],
          route_mix: { answer: 0, clarify: 0, refuse: 0, page_summary: 0, page_qa: 0, unknown: 0 },
          page_context_usage: { used: 0, ignored: 0, miss: 0 },
          refusal_rate: 0,
          dev_note: 'Returning empty metrics due to DB error in dev bypass',
          ...(debugFlag ? { dev_debug: { allowAll, site_id: siteId, offersCount } } : {}),
        } as any;
        return NextResponse.json(metrics);
      }
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

    // Compute offers performance (MV + today's live delta)
    const perf = await getOffersPerformance(supabase, siteId, start, end);

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
    top_offers: calculateTopOffers(events || []),
    offers_performance: perf.items,
    last_updated: { mv_last_day: perf.lastUpdated, generated_at: new Date().toISOString() },
    top_pages: calculateTopPages(events || []),
    // V2 additions powered by route events
    route_mix: calculateRouteMix(events || []),
    page_context_usage: calculatePageContextUsage(events || []),
    refusal_rate: calculateRefusalRate(events || [], sessions || [])
  };
    
    if (debugFlag && allowAll) {
      (metrics as any).dev_debug = {
        allowAll,
        site_id: siteId,
        offersPerf: Array.isArray((metrics as any).offers_performance) ? (metrics as any).offers_performance.length : 0,
        eventsCount: Array.isArray(events) ? events.length : 0,
      };
    }
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

  // 1) Prefer explicit durations from session_end events
  const sessionStarts = events.filter(e => e.event_type === 'session_start');
  const sessionEnds = events.filter(e => e.event_type === 'session_end');
  const durationsFromEvents = sessionEnds
    .map(endEvent => {
      const startEvent = sessionStarts.find(s => s.event_data?.session_id === endEvent.event_data?.session_id);
      if (startEvent && typeof endEvent.event_data?.session_duration === 'number') {
        return endEvent.event_data.session_duration as number;
      }
      return null;
    })
    .filter((d): d is number => d !== null);

  // 2) Fallback to DB sessions (started_at/ended_at) if available
  const durationsFromDB = (sessions || [])
    .filter(s => !!s.ended_at && !!s.started_at)
    .map(s => new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime())
    .filter(ms => ms > 0);

  // 3) If still nothing, approximate by event window per session_id
  const bySession: Record<string, { first: number; last: number }> = {};
  for (const e of events) {
    const sid = e.event_data?.session_id || e.user_session_id;
    if (!sid) continue;
    const ts = new Date(e.created_at).getTime();
    const agg = (bySession[sid] ||= { first: ts, last: ts });
    if (ts < agg.first) agg.first = ts;
    if (ts > agg.last) agg.last = ts;
  }
  const durationsFromWindow = Object.values(bySession)
    .map(w => Math.max(0, w.last - w.first))
    .filter(ms => ms > 0);

  const pool = durationsFromEvents.length > 0
    ? durationsFromEvents
    : (durationsFromDB.length > 0 ? durationsFromDB : durationsFromWindow);

  const avgSessionDuration = pool.length > 0
    ? Math.round(pool.reduce((sum, d) => sum + d, 0) / pool.length / 1000) // seconds
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
  const sidebarEvents = events.filter(e => e.event_data?.widget_type === 'sidebar');

  const floatingOpens = floatingEvents.filter(e => e.event_type === 'widget_open').length;
  const inlineLoads = inlineEvents.filter(e => e.event_type === 'inline_widget_loaded').length;
  const sidebarOpens = sidebarEvents.filter(e => e.event_type === 'widget_open').length;

  const floatingClicks = floatingEvents.filter(e => e.event_type === 'link_click').length;
  const inlineClicks = inlineEvents.filter(e => e.event_type === 'link_click').length;
  const sidebarClicks = sidebarEvents.filter(e => e.event_type === 'link_click').length;

  return {
    floating: {
      opens: floatingOpens,
      clicks: floatingClicks,
      conversion_rate: floatingOpens > 0 ? Math.round((floatingClicks / floatingOpens) * 1000) / 10 : 0, // % with 1 decimal
      engagement_rate: floatingOpens > 0 ? Math.round((floatingOpens / (floatingOpens + inlineLoads)) * 1000) / 10 : 0
    },
    inline: {
      loads: inlineLoads,
      opens: inlineLoads, // Back-compat for UI expecting 'opens'
      clicks: inlineClicks,
      conversion_rate: inlineLoads > 0 ? Math.round((inlineClicks / inlineLoads) * 1000) / 10 : 0,
      engagement_rate: inlineLoads > 0 ? Math.round((inlineLoads / (floatingOpens + inlineLoads)) * 1000) / 10 : 0
    },
    sidebar: {
      opens: sidebarOpens,
      clicks: sidebarClicks,
      conversion_rate: sidebarOpens > 0 ? Math.round((sidebarClicks / sidebarOpens) * 1000) / 10 : 0
    }
  } as any;
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

// --- V2 helpers ---
function calculateTopPages(events: any[]) {
  type PageAgg = {
    page_url: string;
    sessions: number;
    opens: number;
    impressions: number;
    clicks: number;
    last_seen: string;
  };
  const byPage: Record<string, PageAgg> = {};
  for (const e of events) {
    const url = (e as any).page_url || (e as any).event_data?.page_url || null;
    if (!url) continue;
    const agg = (byPage[url] ||= {
      page_url: url,
      sessions: 0,
      opens: 0,
      impressions: 0,
      clicks: 0,
      last_seen: (e as any).created_at,
    });
    const t = ((e as any).event_type || '').toLowerCase();
    if (t === 'session_start') agg.sessions++;
    if (t === 'widget_open' || t === 'inline_widget_loaded') agg.opens++;
    if (t === 'offer_impression') agg.impressions++;
    if (t === 'link_click') agg.clicks++;
    if (!agg.last_seen || (new Date((e as any).created_at) > new Date(agg.last_seen))) agg.last_seen = (e as any).created_at;
  }
  const items = Object.values(byPage)
    .map((p) => ({
      ...p,
      ctr: p.impressions > 0 ? Math.round((p.clicks / p.impressions) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);
  return items;
}

function calculateRouteMix(events: any[]) {
  const route = events.filter(e => e.event_type === 'route');
  const counts = route.reduce((m: Record<string, number>, e) => {
    const k = (e.route_mode || 'unknown').toLowerCase();
    m[k] = (m[k] || 0) + 1; return m;
  }, {} as Record<string, number>);
  return {
    answer: counts['answer'] || 0,
    clarify: counts['clarify'] || 0,
    refuse: counts['refuse'] || 0,
    page_summary: counts['page-summary'] || 0,
    page_qa: counts['page-qa'] || 0,
    unknown: counts['unknown'] || 0
  };
}

function calculatePageContextUsage(events: any[]) {
  const route = events.filter(e => e.event_type === 'route');
  return {
    used: route.filter(e => e.page_context_used === 'used').length,
    ignored: route.filter(e => e.page_context_used === 'ignored').length,
    miss: route.filter(e => e.page_context_used === 'miss').length,
  };
}

function calculateRefusalRate(events: any[], sessions: ChatSession[]) {
  const route = events.filter(e => e.event_type === 'route');
  const refusals = route.filter(e => (e.route_mode || '').toLowerCase() === 'refuse').length;
  const totalSessions = sessions.length || 1;
  return Math.round((refusals / totalSessions) * 1000) / 1000;
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

// --- DB helpers ---
async function getOffersPerformance(supabase: any, siteId: string, startISO: string, endISO: string): Promise<{ items: any[]; lastUpdated: string | null }> {
  // 1) Load all offers for the site (best-effort, never throw in dev)
  let offers: any[] = [];
  try {
    const { data } = await supabase
      .from('affiliate_links')
      .select('id, title, url')
      .eq('site_id', siteId);
    offers = data || [];
  } catch (e) {
    console.warn('[offers_performance] failed to read affiliate_links', e);
    // If we can’t read offers, just return []
    return { items: [], lastUpdated: null };
  }

  // 2) Try to read MV; if unavailable, proceed with zeros
  let rows: any[] = [];
  let lastMVDay: string | null = null;
  try {
    const startDay = new Date(startISO).toISOString().slice(0, 10);
    const endDay = new Date(endISO).toISOString().slice(0, 10);
    const { data: mvRows } = await supabase
      .from('offer_metrics_daily')
      .select('link_id, link_url, day, impressions, clicks, last_seen')
      .eq('site_id', siteId)
      .gte('day', startDay)
      .lte('day', endDay);
    rows = mvRows || [];
    if (rows.length) {
      lastMVDay = rows.map((r: any) => r.day).sort().slice(-1)[0] || null;
    }
  } catch (e) {
    console.warn('[offers_performance] MV read failed; returning zeros', e);
    rows = [];
  }

  const byId: Record<string, { impressions: number; clicks: number; last_seen: string | null }> = {};
  const byUrl: Record<string, { impressions: number; clicks: number; last_seen: string | null }> = {};
  for (const r of rows) {
    const id = r.link_id as string | null;
    const url = r.link_url as string | null;
    const inc = { impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0), last_seen: r.last_seen as string };
    if (id) {
      if (!byId[id]) byId[id] = { impressions: 0, clicks: 0, last_seen: null };
      byId[id].impressions += inc.impressions;
      byId[id].clicks += inc.clicks;
      if (!byId[id].last_seen || new Date(inc.last_seen) > new Date(byId[id].last_seen!)) byId[id].last_seen = inc.last_seen;
    } else if (url) {
      if (!byUrl[url]) byUrl[url] = { impressions: 0, clicks: 0, last_seen: null };
      byUrl[url].impressions += inc.impressions;
      byUrl[url].clicks += inc.clicks;
      if (!byUrl[url].last_seen || new Date(inc.last_seen) > new Date(byUrl[url].last_seen!)) byUrl[url].last_seen = inc.last_seen;
    }
  }

  // 3) Add today's live delta so UI feels instant
  try {
    const todayStart = new Date();
    const yyyy = todayStart.getUTCFullYear();
    const mm = String(todayStart.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(todayStart.getUTCDate()).padStart(2, '0');
    const todayISO = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
    const { data: live } = await supabase
      .from('analytics_events')
      .select('link_id, event_type, event_data, created_at')
      .eq('site_id', siteId)
      .gte('created_at', todayISO)
      .lte('created_at', endISO)
      .in('event_type', ['offer_impression', 'link_click']);
    (live || []).forEach((e: any) => {
      const id = e.link_id as string | null;
      const url = (e.event_data?.link_url as string) || null;
      const isImp = (e.event_type || '') === 'offer_impression';
      const isClk = (e.event_type || '') === 'link_click';
      const inc = { impressions: isImp ? 1 : 0, clicks: isClk ? 1 : 0, last_seen: e.created_at as string };
      if (id) {
        if (!byId[id]) byId[id] = { impressions: 0, clicks: 0, last_seen: null };
        byId[id].impressions += inc.impressions;
        byId[id].clicks += inc.clicks;
        if (!byId[id].last_seen || new Date(inc.last_seen) > new Date(byId[id].last_seen!)) byId[id].last_seen = inc.last_seen;
      } else if (url) {
        if (!byUrl[url]) byUrl[url] = { impressions: 0, clicks: 0, last_seen: null };
        byUrl[url].impressions += inc.impressions;
        byUrl[url].clicks += inc.clicks;
        if (!byUrl[url].last_seen || new Date(inc.last_seen) > new Date(byUrl[url].last_seen!)) byUrl[url].last_seen = inc.last_seen;
      }
    });
  } catch (e) {
    console.warn('[offers_performance] live-delta read failed', e);
  }

  const out = offers.map((o: any) => {
    const agg = (o.id && byId[o.id]) || byUrl[o.url] || { impressions: 0, clicks: 0, last_seen: null };
    const ctr = agg.impressions > 0 ? Math.round((agg.clicks / agg.impressions) * 1000) / 10 : 0;
    return {
      id: o.id,
      title: o.title,
      url: o.url,
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr,
      last_seen: agg.last_seen,
    };
  });

  out.sort((a: any, b: any) => (b.clicks - a.clicks) || (b.impressions - a.impressions));
  return { items: out, lastUpdated: lastMVDay };
}
