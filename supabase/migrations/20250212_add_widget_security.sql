-- Add widget security features to sites table
-- This enables proper JWT-based authentication for embedded widgets

-- 1. Add allowed_origins field for CORS validation
ALTER TABLE sites 
ADD COLUMN allowed_origins JSONB DEFAULT '[]'::jsonb;

-- 2. Add widget security settings
ALTER TABLE sites 
ADD COLUMN widget_rate_limit_per_minute INTEGER DEFAULT 60,
ADD COLUMN widget_enabled BOOLEAN DEFAULT true;

-- 3. Create index for origin lookups
CREATE INDEX IF NOT EXISTS idx_sites_widget_enabled 
ON sites(widget_enabled) WHERE widget_enabled = true;

-- 4. Add helpful comments
COMMENT ON COLUMN sites.allowed_origins IS 
'JSON array of allowed origins for CORS validation (e.g., ["https://example.com", "https://www.example.com"])';

COMMENT ON COLUMN sites.widget_rate_limit_per_minute IS 
'Maximum product search requests per minute per IP for this site';

COMMENT ON COLUMN sites.widget_enabled IS 
'Whether the chat widget is enabled for this site';

-- 5. Update existing sites to allow localhost for development
UPDATE sites 
SET allowed_origins = '["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]'::jsonb
WHERE allowed_origins = '[]'::jsonb;