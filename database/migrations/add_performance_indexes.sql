-- Performance optimization indexes for chat application
-- These indexes significantly improve query performance for high-traffic scenarios

-- 1. Training materials: Optimize context selection queries
-- Most common query: site_id + scrape_status + ordering by update time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_materials_site_status_updated 
ON training_materials(site_id, scrape_status, updated_at DESC) 
WHERE scrape_status = 'success';

-- 2. Training materials: Full-text search for context matching
-- Add a computed column for full-text search
ALTER TABLE training_materials ADD COLUMN IF NOT EXISTS fts_content tsvector 
GENERATED ALWAYS AS (
  to_tsvector('english', 
    COALESCE(title, '') || ' ' || 
    COALESCE(content, '') || ' ' || 
    COALESCE(summary, '')
  )
) STORED;

-- Create GIN index on the computed column for fast full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_materials_fts 
ON training_materials USING GIN (fts_content) 
WHERE scrape_status = 'success';

-- 3. Chat messages: Optimize session history queries
-- Most common query: session_id + role + ordering by creation time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_role_created 
ON chat_messages(chat_session_id, role, created_at DESC);

-- 4. Chat sessions: Optimize active session queries
-- For finding recent active sessions per site
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_sessions_site_activity 
ON chat_sessions(site_id, last_activity_at DESC, is_active) 
WHERE is_active = true;

-- 5. Affiliate links: Optimize product matching queries
-- For fast title and description searches during product matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_links_site_text_search 
ON affiliate_links USING GIN (
  site_id,
  to_tsvector('english', 
    title || ' ' || 
    COALESCE(description, '') || ' ' ||
    COALESCE(aliases, '')
  )
);

-- 6. Affiliate links: Optimize basic site queries with common columns
-- Covers most SELECT queries for affiliate links
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_links_site_created 
ON affiliate_links(site_id, created_at DESC);

-- 7. Analytics events: Optimize dashboard analytics queries
-- For fast analytics aggregations by site and event type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_site_type_timestamp 
ON analytics_events(site_id, event_type, timestamp DESC) 
WHERE timestamp > NOW() - INTERVAL '30 days';

-- 8. Training materials: Optimize content type queries
-- For filtering by content type during context selection
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_materials_site_type_confidence 
ON training_materials(site_id, content_type, confidence_score DESC) 
WHERE scrape_status = 'success' AND confidence_score IS NOT NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_training_materials_site_status_updated IS 'Optimizes context selection queries by site and status';
COMMENT ON INDEX idx_training_materials_fts IS 'Enables full-text search for content relevance scoring';
COMMENT ON INDEX idx_chat_messages_session_role_created IS 'Optimizes chat history queries for session restoration';
COMMENT ON INDEX idx_chat_sessions_site_activity IS 'Optimizes active session queries for dashboard analytics';
COMMENT ON INDEX idx_affiliate_links_site_text_search IS 'Enables fast product matching via text search';
COMMENT ON INDEX idx_affiliate_links_site_created IS 'Optimizes basic affiliate link queries with ordering';
COMMENT ON INDEX idx_analytics_events_site_type_timestamp IS 'Optimizes dashboard analytics aggregations';
COMMENT ON INDEX idx_training_materials_site_type_confidence IS 'Optimizes content filtering by type and quality';

-- Performance monitoring query to check index usage
-- Run this occasionally to ensure indexes are being used:
-- 
-- SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- WHERE indexname LIKE 'idx_%' 
-- ORDER BY idx_tup_read DESC;