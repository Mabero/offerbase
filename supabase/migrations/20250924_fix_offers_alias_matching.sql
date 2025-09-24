-- Fix alias matching so brand-only aliases in user sentences (e.g., "er wix bra") resolve consistently
-- Changes:
-- 1) Reverse FTS direction to check if the QUERY contains the ALIAS tokens
-- 2) Boost alias-in-query FTS score to 0.8 (was 0.7) so resolver can pick a single winner
-- 3) Lower trigram threshold for very short aliases (<= 4 chars) to help short brands like "wix"

BEGIN;

-- Drop existing function to allow return type/OUT changes if any
DROP FUNCTION IF EXISTS search_offers_stateless(TEXT, UUID);

CREATE OR REPLACE FUNCTION search_offers_stateless(
  p_query_norm TEXT,
  p_site_id UUID
) RETURNS TABLE (
  offer_id UUID,
  title TEXT,
  brand TEXT,
  model TEXT,
  brand_norm TEXT,
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
      MAX((CASE 
        WHEN oa.alias_norm = p_query_norm THEN 1.0
        -- Reversed FTS: does the user query contain the alias tokens?
        WHEN to_tsvector('simple', p_query_norm) @@ plainto_tsquery('simple', oa.alias_norm)
          THEN 0.8
        -- Trigram similarity with short-token safety for brands like "wix"
        WHEN char_length(oa.alias_norm) <= 4 AND similarity(oa.alias_norm, p_query_norm) > 0.2 
          THEN similarity(oa.alias_norm, p_query_norm)
        WHEN similarity(oa.alias_norm, p_query_norm) > 0.3 
          THEN similarity(oa.alias_norm, p_query_norm)
        ELSE 0
      END)::double precision) as alias_score
    FROM offers o
    JOIN offer_aliases oa ON o.id = oa.offer_id
    WHERE oa.site_id = p_site_id 
      AND o.site_id = p_site_id
    GROUP BY o.id, o.title, o.brand, o.model, o.brand_norm, o.model_norm, o.url, o.description
    LIMIT 50
  ),
  fts_matches AS (
    SELECT 
      o.id,
      o.title,
      o.brand,
      o.model,
      o.brand_norm,
      o.model_norm,
      o.url,
      o.description,
      (GREATEST(
        CASE WHEN to_tsvector('simple', o.title_norm) @@ plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.title_norm), plainto_tsquery('simple', p_query_norm))
             ELSE 0 END,
        CASE WHEN o.brand_norm IS NOT NULL AND to_tsvector('simple', o.brand_norm) @@ plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.brand_norm), plainto_tsquery('simple', p_query_norm))
             ELSE 0 END,
        CASE WHEN o.model_norm IS NOT NULL AND to_tsvector('simple', o.model_norm) @@ plainto_tsquery('simple', p_query_norm)
             THEN ts_rank(to_tsvector('simple', o.model_norm), plainto_tsquery('simple', p_query_norm))
             ELSE 0 END
      ))::double precision as fts_score
    FROM offers o
    WHERE o.site_id = p_site_id
      AND (
        to_tsvector('simple', o.title_norm) @@ plainto_tsquery('simple', p_query_norm)
        OR (o.brand_norm IS NOT NULL AND to_tsvector('simple', o.brand_norm) @@ plainto_tsquery('simple', p_query_norm))
        OR (o.model_norm IS NOT NULL AND to_tsvector('simple', o.model_norm) @@ plainto_tsquery('simple', p_query_norm))
      )
    LIMIT 50
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
    COALESCE(a.alias_score, 0::double precision),
    COALESCE(f.fts_score, 0::double precision)
  FROM alias_matches a
  FULL OUTER JOIN fts_matches f ON a.id = f.id
  WHERE COALESCE(a.alias_score, 0::double precision) > 0 OR COALESCE(f.fts_score, 0::double precision) > 0
  ORDER BY COALESCE(a.alias_score, 0::double precision) + COALESCE(f.fts_score, 0::double precision) DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

COMMIT;
