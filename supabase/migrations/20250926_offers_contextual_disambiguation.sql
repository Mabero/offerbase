-- Disambiguation for short model codes and return normalized fields
-- Ensures we never mix categories on queries like "g3" without page context

BEGIN;

-- Return type changed (added brand_norm, model_norm). Drop old function first.
DROP FUNCTION IF EXISTS match_offers_contextual(uuid, text, text, text[], integer);

CREATE OR REPLACE FUNCTION match_offers_contextual(
  p_site_id uuid,
  p_query text,
  p_ai_text text DEFAULT NULL,
  p_context_keywords text[] DEFAULT NULL,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,              -- offers.id (offer id)
  link_id uuid,         -- affiliate_links.id (stable ID for analytics)
  title text,
  url text,
  image_url text,
  button_text text,
  description text,
  brand_norm text,
  model_norm text,
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
      s.offer_id AS id,
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
      lower(
        coalesce(b.title,'') || ' ' ||
        coalesce(b.brand_norm,'') || ' ' ||
        coalesce(b.model_norm,'') || ' ' ||
        left(coalesce(b.description,''), 160)
      ) AS haystack
    FROM base b
  ), toks AS (
    SELECT unnest(COALESCE(p_context_keywords, ARRAY[]::text[]))::text AS tok
  ), q_toks AS (
    SELECT unnest(regexp_split_to_array(lower(coalesce(p_query,'')), E'\s+')) AS tok
  ), tokens AS (
    SELECT DISTINCT t.tok
    FROM (SELECT tok FROM toks UNION ALL SELECT tok FROM q_toks) t
    WHERE length(t.tok) >= 3 OR t.tok ~ '\\d'
  ), tm AS (
    SELECT c.id, COUNT(*) AS matches
    FROM ctx c
    JOIN tokens t ON position(t.tok IN c.haystack) > 0
    GROUP BY c.id
  ), q_info AS (
    -- code_only = true when user query has no non-numeric tokens of length >= 3
    SELECT (COUNT(*) FILTER (WHERE length(tok) >= 3 AND tok !~ '\\d')) = 0 AS code_only
    FROM q_toks
  )
  SELECT 
    c.id,                               -- offer id
    al.link_id,                         -- affiliate links id (preferred stable ID)
    c.title,
    COALESCE(al.url, c.url) AS url,
    al.image_url,
    COALESCE(al.button_text, 'View Product') AS button_text,
    c.description,
    c.brand_norm,
    c.model_norm,
    CASE WHEN c.alias_score >= 0.8 THEN 'alias'
         WHEN c.fts_score > 0 THEN 'fts'
         ELSE 'fuzzy' END AS match_type,
    (c.base_score * (1 + LEAST(0.15, 0.03 * COALESCE(tm.matches,0))))::double precision AS match_score
  FROM ctx c
  LEFT JOIN LATERAL (
    SELECT 
      al.id AS link_id, 
      al.url, 
      al.image_url, 
      al.button_text
    FROM affiliate_links al
    WHERE al.site_id = p_site_id AND al.title = c.title
    ORDER BY al.created_at DESC NULLS LAST
    LIMIT 1
  ) al ON TRUE
  LEFT JOIN tm ON tm.id = c.id
  WHERE c.base_score > 0
    AND (
      COALESCE(tm.matches, 0) > 0
      OR (SELECT code_only FROM q_info)
    )
  ORDER BY match_score DESC, c.title
  LIMIT LEAST(GREATEST(p_limit,1), 50);
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
