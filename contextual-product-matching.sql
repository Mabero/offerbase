-- Context-aware hierarchical product matching
-- Implements ChatGPT's smart 3-step approach: Exact → Guarded Alias → Fuzzy

-- Step 1: Enable fuzzy matching extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Create index for fuzzy text matching  
CREATE INDEX IF NOT EXISTS idx_affiliate_links_title_trgm 
ON affiliate_links USING gin (lower(title) gin_trgm_ops);

-- Step 3: Create the intelligent matching function
CREATE OR REPLACE FUNCTION match_products_contextual(
    p_site_id uuid,
    p_query text,
    p_ai_text text DEFAULT '',
    p_context_keywords text[] DEFAULT '{}',
    p_limit integer DEFAULT 12
)
RETURNS TABLE (
    id uuid,
    title text,
    url text,
    image_url text,
    button_text text,
    description text,
    match_score float,
    match_type text
) AS $$
DECLARE
    normalized_ai_text text;
    normalized_query text;
    exact_results_count integer;
    alias_results_count integer;
BEGIN
    -- Normalize texts for matching
    normalized_ai_text := lower(regexp_replace(coalesce(p_ai_text, p_query), '[^\w\sæøåäöü]', ' ', 'g'));
    normalized_query := lower(regexp_replace(p_query, '[^\w\sæøåäöü]', ' ', 'g'));
    
    -- STEP A: Exact Title Matching (highest priority)
    -- Check if any product title appears in AI text
    SELECT COUNT(*) INTO exact_results_count
    FROM affiliate_links al
    WHERE al.site_id = p_site_id
      AND length(al.title) >= 4  -- Avoid matching very short titles
      AND position(lower(al.title) IN normalized_ai_text) > 0;
    
    -- If we found exact title matches, return them immediately
    IF exact_results_count > 0 THEN
        RETURN QUERY
        SELECT 
            al.id,
            al.title,
            al.url,
            al.image_url,
            COALESCE(al.button_text, 'View Product')::text,
            COALESCE(al.description, '')::text,
            (3.0 + length(al.title) * 0.1)::float as match_score, -- Higher score for exact matches
            'exact'::text as match_type
        FROM affiliate_links al
        WHERE al.site_id = p_site_id
          AND length(al.title) >= 4
          AND position(lower(al.title) IN normalized_ai_text) > 0
        ORDER BY length(al.title) DESC, al.created_at DESC -- Prefer longer, more specific titles
        LIMIT LEAST(p_limit, 3); -- Max 3 for exact matches
        
        RETURN; -- Stop here, exact matches found
    END IF;
    
    -- STEP B: Context-Guarded Alias Matching
    -- Only proceed if no exact matches found
    RETURN QUERY
    WITH alias_matches AS (
        SELECT DISTINCT
            al.id,
            al.title,
            al.url,
            al.image_url,
            COALESCE(al.button_text, 'View Product') as button_text,
            COALESCE(al.description, '') as description,
            pa.alias,
            -- Context guard: short aliases need context keyword validation
            CASE 
                WHEN length(pa.alias) <= 3 THEN
                    -- Short alias: require context keyword in title or other aliases
                    CASE WHEN array_length(p_context_keywords, 1) > 0 THEN
                        EXISTS (
                            SELECT 1 FROM unnest(p_context_keywords) as ck
                            WHERE position(lower(ck) IN lower(al.title)) > 0
                               OR EXISTS (
                                   SELECT 1 FROM product_aliases pa2 
                                   WHERE pa2.product_id = al.id 
                                   AND position(lower(ck) IN lower(pa2.alias)) > 0
                               )
                        )
                    ELSE true -- No context keywords available, allow match
                    END
                ELSE true -- Long alias, no context guard needed
            END as context_validated
        FROM affiliate_links al
        JOIN product_aliases pa ON pa.product_id = al.id
        WHERE al.site_id = p_site_id
          AND position(lower(pa.alias) IN normalized_ai_text) > 0
    ),
    -- Remove ambiguous matches (same alias matching multiple products)
    filtered_aliases AS (
        SELECT am.*
        FROM alias_matches am
        WHERE am.context_validated = true
        -- Only include if this alias doesn't match too many products
        AND (
            SELECT COUNT(DISTINCT am2.id) 
            FROM alias_matches am2 
            WHERE am2.alias = am.alias AND am2.context_validated = true
        ) <= 2 -- Allow up to 2 products per alias, drop if more (ambiguous)
    )
    SELECT 
        fa.id,
        fa.title,
        fa.url,
        fa.image_url,
        fa.button_text::text,
        fa.description::text,
        2.0::float as match_score, -- Medium score for alias matches
        'alias'::text as match_type
    FROM filtered_aliases fa
    ORDER BY length(fa.alias) DESC, fa.title -- Prefer longer, more specific aliases
    LIMIT LEAST(p_limit, 5); -- Max 5 for alias matches
    
    -- Get count for next step decision
    GET DIAGNOSTICS alias_results_count = ROW_COUNT;
    
    -- STEP C: Fuzzy Fallback (only if no exact or alias matches)
    -- Only proceed if previous steps found nothing
    IF alias_results_count = 0 THEN
        RETURN QUERY
        SELECT 
            al.id,
            al.title,
            al.url,
            al.image_url,
            COALESCE(al.button_text, 'View Product')::text,
            COALESCE(al.description, '')::text,
            similarity(lower(al.title), normalized_ai_text)::float as match_score,
            'fuzzy'::text as match_type
        FROM affiliate_links al
        WHERE al.site_id = p_site_id
          AND similarity(lower(al.title), normalized_ai_text) >= 0.35 -- Minimum similarity threshold
          -- Require at least one context keyword if available
          AND (
              array_length(p_context_keywords, 1) IS NULL 
              OR array_length(p_context_keywords, 1) = 0
              OR EXISTS (
                  SELECT 1 FROM unnest(p_context_keywords) as ck
                  WHERE position(lower(ck) IN lower(al.title)) > 0
                     OR position(lower(ck) IN lower(coalesce(al.description, ''))) > 0
                     OR EXISTS (
                         SELECT 1 FROM product_aliases pa 
                         WHERE pa.product_id = al.id 
                         AND position(lower(ck) IN lower(pa.alias)) > 0
                     )
              )
          )
        ORDER BY similarity(lower(al.title), normalized_ai_text) DESC
        LIMIT LEAST(p_limit, 3); -- Max 3 for fuzzy matches
    END IF;
    
END;
$$ LANGUAGE plpgsql;

-- Create a simpler version for backward compatibility
CREATE OR REPLACE FUNCTION match_products_with_aliases(
    p_site_id uuid,
    p_query text,
    p_limit integer DEFAULT 12
)
RETURNS TABLE (id uuid, title text, url text, image_url text, button_text text, description text, match_score float)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Use the new contextual function without context (fallback mode)
    RETURN QUERY
    SELECT 
        mp.id, mp.title, mp.url, mp.image_url, mp.button_text, mp.description, mp.match_score
    FROM match_products_contextual(p_site_id, p_query, p_query, '{}', p_limit) mp;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION match_products_contextual IS 
'Context-aware hierarchical product matching: 
1. Exact title matches (highest priority)
2. Context-guarded alias matches (with ambiguity detection) 
3. Fuzzy similarity fallback (with context keyword requirement)
Prevents wrong matches like "G3 vacuum" for "G3 hair removal" queries.';

COMMENT ON FUNCTION match_products_with_aliases IS 
'Backward compatible simple matching function that uses the new contextual algorithm without context keywords.';