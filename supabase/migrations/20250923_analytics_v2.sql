-- Analytics v2: add enriched fields and indexes
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS widget_type TEXT,
  ADD COLUMN IF NOT EXISTS route_mode TEXT,
  ADD COLUMN IF NOT EXISTS refusal_reason TEXT,
  ADD COLUMN IF NOT EXISTS page_context_used TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_url ON analytics_events(page_url);
CREATE INDEX IF NOT EXISTS idx_analytics_events_route_mode ON analytics_events(route_mode);
