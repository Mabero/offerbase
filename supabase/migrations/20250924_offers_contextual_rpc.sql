-- Contextual offers matching built on top of search_offers_stateless
-- Returns UI-ready fields without changing the offers schema

BEGIN;

CREATE OR REPLACE FUNCTION match_offers_contextual(
  p_site_id uuid,
  p_query text,
  p_ai_text text DEFAULT NULL,
  p_context_keywords text[] DEFAULT NULL,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  title text,
  url text,
  image_url text,
  button_text text,
  description text,
  match_type text,
  match_score double precision
) AS $$
DECLARE
  v_query_norm text;
BEGIN
  v_query_norm := normalize_text(COALESCE(p_ai_text, p_query));

  RETURN QUERY
  WITH base AS (
    SELECT 
      s.offer_id as id,
      s.title,
      s.url,
      s.description,
      s.brand_norm,
      s.model_norm,
      (s.alias_score)::double precision AS alias_score,
      (s.fts_score)::double precision AS fts_score,
      ((s.alias_score)::double precision + 0.7 * (s.fts_score)::double precision) AS base_score
    FROM search_offers_stateless(v_query_norm, p_site_id) s
  ), ctx AS (
    SELECT 
      b.*,
      lower(coalesce(b.title,'') || ' ' || coalesce(b.brand_norm,'') || ' ' || coalesce(b.model_norm,'')) AS haystack
    FROM base b
  ), toks AS (
    SELECT unnest(COALESCE(p_context_keywords, ARRAY[]::text[]))::text AS tok
  ), q_toks AS (
    SELECT unnest(regexp_split_to_array(lower(coalesce(p_query,'')), E'\s+')) AS tok
  ), tokens AS (
    SELECT DISTINCT t.tok
    FROM (SELECT tok FROM toks UNION ALL SELECT tok FROM q_toks) t
    WHERE length(t.tok) >= 3 OR t.tok ~ '\\d'
  )
  SELECT 
    c.id,
    c.title,
    COALESCE(al.url, c.url) AS url,
    al.image_url,
    COALESCE(al.button_text, 'Learn more') AS button_text,
    c.description,
    CASE WHEN c.alias_score >= 0.8 THEN 'alias'
         WHEN c.fts_score > 0 THEN 'fts'
         ELSE 'fuzzy' END AS match_type,
    (c.base_score * (1 + LEAST(0.15, 0.03 * COALESCE(tm.matches,0))))::double precision AS match_score
  FROM ctx c
  LEFT JOIN LATERAL (
    SELECT url, image_url, button_text
    FROM affiliate_links al
    WHERE al.site_id = p_site_id AND al.title = c.title
    ORDER BY al.created_at DESC NULLS LAST
    LIMIT 1
  ) al ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS matches
    FROM tokens t
    WHERE position(t.tok IN c.haystack) > 0
  ) tm ON TRUE
  WHERE c.base_score > 0
  ORDER BY match_score DESC, c.title
  LIMIT LEAST(GREATEST(p_limit,1), 50);
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;

