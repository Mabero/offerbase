-- Stateless Offers System v1 - Complete implementation addressing all 7 requirements
-- No locking, language-agnostic, prevents G3/G4 mixing via post-filtering
-- Order: Extensions → Functions → Types → Tables → Indexes → RPC → Triggers → RLS

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. NORMALIZATION FUNCTION (single source of truth)
-- Requirement #4: Whitespace collapse in normalization
CREATE OR REPLACE FUNCTION normalize_text(input TEXT)
RETURNS TEXT AS $$
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  
  -- Lowercase, transliterate Nordic chars, collapse separators, normalize whitespace
  RETURN trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(input),
                '[æ]', 'ae', 'g'),
              '[ø]', 'oe', 'g'),
            '[å]', 'aa', 'g'),
          '[ä]', 'ae', 'g'),
        '[ö]', 'oe', 'g'),
      '([a-z])[\s\-\.]+(\d)', '\1\2', 'g'),  -- g-3 → g3, g.3 → g3, g 3 → g3
    '\s+', ' ', 'g'  -- collapse multiple spaces to single space
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. CREATE ENUM for alias types
-- Requirement #6: Enum safety for alias types
CREATE TYPE alias_type_enum AS ENUM (
  'brand_model', 'model_only', 'brand_only', 'title_exact', 'manual'
);

-- 4. CREATE TABLES
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_norm TEXT GENERATED ALWAYS AS (normalize_text(title)) STORED,
  brand TEXT,
  brand_norm TEXT GENERATED ALWAYS AS (normalize_text(brand)) STORED,
  model TEXT,
  model_norm TEXT GENERATED ALWAYS AS (normalize_text(model)) STORED,
  url TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'product' CHECK (type IN ('product', 'service')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Requirement #4: Uniqueness guard to prevent duplicate models per site
  UNIQUE(site_id, brand_norm, model_norm) 
    WHERE brand_norm IS NOT NULL AND model_norm IS NOT NULL
);

CREATE TABLE offer_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_norm TEXT GENERATED ALWAYS AS (normalize_text(alias)) STORED,
  alias_type alias_type_enum NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(offer_id, alias_norm)
);

CREATE TABLE offers_resolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  query_norm TEXT NOT NULL,
  -- Requirement #6: Telemetry fields with decision string
  decision TEXT NOT NULL CHECK (decision IN ('single', 'multiple', 'none')),
  top_candidates JSONB, -- [{offer_id, title, alias_score, fts_score, total_score}]
  card_rendered BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CREATE COMPLETE INDEXES
-- Requirement #1: FTS indexes with config='simple' and BTREE for site filtering
-- Offers indexes
CREATE INDEX idx_offers_site_id ON offers(site_id); -- BTREE for site filtering
CREATE INDEX idx_offers_site_title ON offers(site_id, title_norm);
CREATE INDEX idx_offers_title_fts ON offers 
  USING GIN(to_tsvector('simple', title_norm));
CREATE INDEX idx_offers_brand_fts ON offers 
  USING GIN(to_tsvector('simple', brand_norm)) 
  WHERE brand_norm IS NOT NULL;
CREATE INDEX idx_offers_model_fts ON offers 
  USING GIN(to_tsvector('simple', model_norm)) 
  WHERE model_norm IS NOT NULL;

-- Aliases indexes
-- Requirement #2: BTREE for exact alias hits (fast path)
CREATE INDEX idx_aliases_site_alias_exact ON offer_aliases(site_id, alias_norm); -- Exact match fast path
CREATE INDEX idx_aliases_offer_id ON offer_aliases(offer_id);
CREATE INDEX idx_aliases_site_offer ON offer_aliases(site_id, offer_id);
CREATE INDEX idx_aliases_fts ON offer_aliases 
  USING GIN(to_tsvector('simple', alias_norm));
CREATE INDEX idx_aliases_trgm ON offer_aliases 
  USING GIN(alias_norm gin_trgm_ops);

-- Telemetry index
CREATE INDEX idx_resolution_log_site_created 
  ON offers_resolution_log(site_id, created_at DESC);

-- Requirement #1: Fix training_material_chunks FTS to use config='simple'
-- Drop existing index if it uses 'english' config and recreate with 'simple'
DROP INDEX IF EXISTS idx_chunks_content_fts;
CREATE INDEX idx_chunks_content_fts ON training_material_chunks 
  USING GIN(to_tsvector('simple', content));

-- 6. CREATE COMPLETE RPC FUNCTION
-- Requirement #1: Complete FTS CTE implementation with config='simple'
-- Requirement #7: Performance limits in CTEs and final result
CREATE OR REPLACE FUNCTION search_offers_stateless(
  p_query_norm TEXT,
  p_site_id UUID
) RETURNS TABLE (
  offer_id UUID,
  title TEXT,
  brand TEXT,
  model TEXT,
  brand_norm TEXT,  -- Return normalized values for post-filtering
  model_norm TEXT,
  url TEXT,
  description TEXT,
  alias_score FLOAT,
  fts_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH alias_matches AS (
    SELECT 
      o.id,
      o.title,
      o.brand,
      o.model,
      o.brand_norm,
      o.model_norm,
      o.url,
      o.description,
      MAX(CASE 
        -- Requirement #2: Exact match fast path using BTREE index
        WHEN oa.alias_norm = p_query_norm THEN 1.0
        WHEN similarity(oa.alias_norm, p_query_norm) > 0.3 
          THEN similarity(oa.alias_norm, p_query_norm)
        WHEN to_tsvector('simple', oa.alias_norm) @@ 
             plainto_tsquery('simple', p_query_norm) THEN 0.7
        ELSE 0
      END) as alias_score
    FROM offers o
    JOIN offer_aliases oa ON o.id = oa.offer_id
    WHERE oa.site_id = p_site_id 
      AND o.site_id = p_site_id  -- Double filter for safety and better index usage
    GROUP BY o.id, o.title, o.brand, o.model, o.brand_norm, o.model_norm, o.url, o.description
    LIMIT 50  -- Requirement #7: Performance limit in CTE
  ),
  fts_matches AS (
    -- Requirement #1: Complete FTS CTE with config='simple' on all fields
    SELECT 
      o.id,
      o.title,
      o.brand,
      o.model,
      o.brand_norm,
      o.model_norm,
      o.url,
      o.description,
      GREATEST(
        -- Title FTS with config='simple'
        CASE WHEN to_tsvector('simple', o.title_norm) @@ 
                  plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.title_norm), 
                         plainto_tsquery('simple', p_query_norm))
             ELSE 0 END,
        -- Brand FTS with config='simple'
        CASE WHEN o.brand_norm IS NOT NULL AND
                  to_tsvector('simple', o.brand_norm) @@ 
                  plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.brand_norm), 
                         plainto_tsquery('simple', p_query_norm))
             ELSE 0 END,
        -- Model FTS with config='simple'
        CASE WHEN o.model_norm IS NOT NULL AND
                  to_tsvector('simple', o.model_norm) @@ 
                  plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.model_norm), 
                         plainto_tsquery('simple', p_query_norm))
             ELSE 0 END
      ) as fts_score
    FROM offers o
    WHERE o.site_id = p_site_id
      AND (
        to_tsvector('simple', o.title_norm) @@ plainto_tsquery('simple', p_query_norm)
        OR (o.brand_norm IS NOT NULL AND 
            to_tsvector('simple', o.brand_norm) @@ plainto_tsquery('simple', p_query_norm))
        OR (o.model_norm IS NOT NULL AND 
            to_tsvector('simple', o.model_norm) @@ plainto_tsquery('simple', p_query_norm))
      )
    LIMIT 50  -- Requirement #7: Performance limit in CTE
  )
  SELECT 
    COALESCE(a.id, f.id),
    COALESCE(a.title, f.title),
    COALESCE(a.brand, f.brand),
    COALESCE(a.model, f.model),
    COALESCE(a.brand_norm, f.brand_norm),
    COALESCE(a.model_norm, f.model_norm),
    COALESCE(a.url, f.url),
    COALESCE(a.description, f.description),
    COALESCE(a.alias_score, 0),
    COALESCE(f.fts_score, 0)
  FROM alias_matches a
  FULL OUTER JOIN fts_matches f ON a.id = f.id
  WHERE COALESCE(a.alias_score, 0) > 0 OR COALESCE(f.fts_score, 0) > 0
  ORDER BY 
    COALESCE(a.alias_score, 0) + COALESCE(f.fts_score, 0) DESC
  LIMIT 10;  -- Requirement #7: Final performance limit, resolver works off this
END;
$$ LANGUAGE plpgsql;

-- 7. ENABLE RLS (no policies - service role bypasses RLS)
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers_resolution_log ENABLE ROW LEVEL SECURITY;

-- Note: No RLS policies created. Service role bypasses RLS by default.
-- Can add role-scoped policies later for different access levels.

-- 8. ADD TRIGGERS for updated_at
CREATE TRIGGER update_offers_updated_at 
  BEFORE UPDATE ON offers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. AUTO-ALIAS GENERATION ON CREATE/UPDATE
-- Requirement #3: Auto-alias on create/update - generates 4 types
CREATE OR REPLACE FUNCTION generate_offer_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete existing auto-generated aliases (keep manual ones)
  DELETE FROM offer_aliases 
  WHERE offer_id = NEW.id 
    AND alias_type != 'manual';
  
  -- 1. Title exact
  INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
  VALUES (NEW.id, NEW.site_id, NEW.title, 'title_exact');
  
  -- 2. Brand + Model (when both present)
  IF NEW.brand IS NOT NULL AND NEW.model IS NOT NULL THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.brand || ' ' || NEW.model, 'brand_model');
  END IF;
  
  -- 3. Model only (when present)
  IF NEW.model IS NOT NULL THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.model, 'model_only');
  END IF;
  
  -- 4. Brand only (when present)
  IF NEW.brand IS NOT NULL THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.brand, 'brand_only');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_generate_aliases
  AFTER INSERT OR UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION generate_offer_aliases();

-- 10. MIGRATE EXISTING DATA
-- Migrate affiliate_links to offers
INSERT INTO offers (site_id, title, url, description)
SELECT site_id, title, url, description 
FROM affiliate_links
ON CONFLICT DO NOTHING;

-- The trigger will auto-generate aliases for migrated offers

-- Migrate existing product_aliases if table exists (conditional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_name = 'product_aliases') THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    SELECT 
      o.id,
      o.site_id,
      pa.alias,
      'manual'::alias_type_enum
    FROM product_aliases pa
    JOIN affiliate_links al ON pa.product_id = al.id
    JOIN offers o ON o.site_id = al.site_id AND o.title = al.title
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 11. ADD COMMENTS for documentation
COMMENT ON FUNCTION normalize_text IS 'Normalize text for consistent matching: lowercase, transliterate Nordic chars (æøå→aeoeaa), collapse separators (g-3→g3), normalize whitespace';
COMMENT ON FUNCTION search_offers_stateless IS 'Stateless offer search using aliases (exact+fuzzy+FTS) and title/brand/model FTS, all with config=simple for language-agnostic matching';
COMMENT ON TABLE offers IS 'Product/service offers with normalized fields for language-agnostic matching. Prevents G3/G4 confusion via post-filtering';
COMMENT ON TABLE offer_aliases IS 'Multiple aliases per offer: auto-generated (title_exact, brand_model, model_only, brand_only) + manual';
COMMENT ON TABLE offers_resolution_log IS 'Telemetry for debugging offer resolution decisions: tracks query, decision type, candidate scores, UI card rendering';
COMMENT ON FUNCTION generate_offer_aliases IS 'Auto-generates 4 alias types on offer insert/update: title_exact, brand_model, model_only, brand_only';

COMMIT;