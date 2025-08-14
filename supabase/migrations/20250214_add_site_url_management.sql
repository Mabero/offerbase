-- Add site URL management for automatic allowed origins
-- This enables users to simply enter their website URL when creating sites
-- and automatically generates the appropriate allowed origins for CORS validation

-- 1. Add site_url field to track the main URL for each site
ALTER TABLE sites 
ADD COLUMN site_url TEXT,
ADD COLUMN site_url_verified BOOLEAN DEFAULT false;

-- 2. Create index for faster URL lookups
CREATE INDEX IF NOT EXISTS idx_sites_site_url ON sites(site_url) WHERE site_url IS NOT NULL;

-- 3. Add helpful comments
COMMENT ON COLUMN sites.site_url IS 
'The main URL/domain where this site widget will be embedded (e.g., https://example.com)';

COMMENT ON COLUMN sites.site_url_verified IS 
'Whether the site URL has been verified through DNS or other means (future enhancement)';

-- 4. Update existing sites to have default localhost allowed origins
-- This ensures backward compatibility for existing sites
UPDATE sites 
SET allowed_origins = jsonb_build_array(
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
)
WHERE allowed_origins = '[]'::jsonb OR allowed_origins IS NULL;

-- 5. Add constraint to ensure site_url format is valid if provided
ALTER TABLE sites 
ADD CONSTRAINT check_site_url_format 
CHECK (
    site_url IS NULL OR 
    site_url ~ '^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/?.*$'
);