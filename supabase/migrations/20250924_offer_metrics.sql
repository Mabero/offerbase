-- Offer metrics: future-proof aggregations for growing volume
-- 1) Add generated column for link_url to speed joins and indexing
ALTER TABLE analytics_events
  ADD COLUMN IF NOT EXISTS link_url TEXT GENERATED ALWAYS AS ((event_data->>'link_url')) STORED;

-- Helpful partial indexes
CREATE INDEX IF NOT EXISTS idx_ae_site_link ON analytics_events(site_id, link_url) WHERE link_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ae_event_link ON analytics_events(event_type, link_url) WHERE link_url IS NOT NULL;

-- Recreate the view using the generated column to avoid grouping on JSON expression
DROP MATERIALIZED VIEW IF EXISTS offer_metrics_daily;
CREATE MATERIALIZED VIEW offer_metrics_daily AS
SELECT
  site_id,
  link_url,
  DATE(created_at) AS day,
  COUNT(*) FILTER (WHERE event_type = 'offer_impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'link_click') AS clicks,
  MAX(created_at) AS last_seen
FROM analytics_events
WHERE event_type IN ('offer_impression', 'link_click')
  AND link_url IS NOT NULL
GROUP BY site_id, link_url, DATE(created_at);

-- Indexes for fast scans and concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_metrics_daily_unique ON offer_metrics_daily(site_id, link_url, day);
CREATE INDEX IF NOT EXISTS idx_offer_metrics_daily_site_day ON offer_metrics_daily(site_id, day);
CREATE INDEX IF NOT EXISTS idx_offer_metrics_daily_site_link ON offer_metrics_daily(site_id, link_url);

-- 3) Convenience function to refresh concurrently (requires unique index above)
CREATE OR REPLACE FUNCTION refresh_offer_metrics_daily() RETURNS void LANGUAGE SQL AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY offer_metrics_daily;
$$;
