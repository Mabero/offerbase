-- Add generated link_id column and rework MV to prefer IDs over URLs

BEGIN;

-- 1) Add generated column for link_id to analytics_events (nullable)
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS link_id UUID GENERATED ALWAYS AS ((event_data->>'link_id')::uuid) STORED;

-- Helpful index for (site_id, link_id)
CREATE INDEX IF NOT EXISTS idx_ae_site_linkid ON analytics_events(site_id, link_id) WHERE link_id IS NOT NULL;

-- 2) Recreate the materialized view to include link_id (fallback to URL)
DROP MATERIALIZED VIEW IF EXISTS offer_metrics_daily;
CREATE MATERIALIZED VIEW offer_metrics_daily AS
SELECT
  site_id,
  link_id,
  (event_data->>'link_url')::text AS link_url,
  DATE(created_at) AS day,
  COUNT(*) FILTER (WHERE event_type = 'offer_impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'link_click') AS clicks,
  MAX(created_at) AS last_seen
FROM analytics_events
WHERE event_type IN ('offer_impression', 'link_click')
GROUP BY site_id, link_id, (event_data->>'link_url'), DATE(created_at);

-- Indexes for fast scans and refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_metrics_daily_unique 
  ON offer_metrics_daily(site_id, day, link_id, link_url);
CREATE INDEX IF NOT EXISTS idx_offer_metrics_daily_site_day ON offer_metrics_daily(site_id, day);
CREATE INDEX IF NOT EXISTS idx_offer_metrics_daily_site_linkid ON offer_metrics_daily(site_id, link_id);

-- 3) Convenience function to refresh concurrently remains available
CREATE OR REPLACE FUNCTION refresh_offer_metrics_daily() RETURNS void LANGUAGE SQL AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY offer_metrics_daily;
$$;

COMMIT;

