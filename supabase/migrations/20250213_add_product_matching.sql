-- Add optimized indexes for product matching
-- These indexes will make product search queries fast even with thousands of products

-- 1. Index for fast site filtering (BTREE)
CREATE INDEX IF NOT EXISTS idx_affiliate_links_site_id_title 
ON affiliate_links(site_id, title);

-- 2. Full-text search index on product titles (GIN)
CREATE INDEX IF NOT EXISTS idx_affiliate_links_title_fts 
ON affiliate_links USING GIN(to_tsvector('english', title));

-- 3. Full-text search index on aliases (GIN) 
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_fts 
ON product_aliases USING GIN(to_tsvector('english', alias));

-- 4. Fast join index for product aliases
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id_alias 
ON product_aliases(product_id, alias);

-- 5. Create optimized RPC function for server-side product matching
CREATE OR REPLACE FUNCTION match_products_with_aliases(
    p_site_id uuid,
    p_query text,
    p_limit integer DEFAULT 12
)
RETURNS TABLE (
    id uuid,
    title text,
    url text,
    image_url text,
    button_text text,
    description text,
    match_score float
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        al.id,
        al.title,
        al.url,
        al.image_url,
        COALESCE(al.button_text, 'View Product') as button_text,
        COALESCE(al.description, '') as description,
        GREATEST(
            -- Score title matches higher (full-text search)
            CASE 
                WHEN to_tsvector('english', al.title) @@ plainto_tsquery('english', p_query) 
                THEN ts_rank(to_tsvector('english', al.title), plainto_tsquery('english', p_query)) * 2.0
                ELSE 0.0
            END,
            -- Score alias matches (full-text search)
            COALESCE(
                (SELECT MAX(
                    CASE 
                        WHEN to_tsvector('english', pa.alias) @@ plainto_tsquery('english', p_query)
                        THEN ts_rank(to_tsvector('english', pa.alias), plainto_tsquery('english', p_query)) * 1.5
                        ELSE 0.0
                    END
                ) FROM product_aliases pa WHERE pa.product_id = al.id), 
                0.0
            ),
            -- Fallback: simple text containment for partial matches (lower score)
            CASE 
                WHEN LOWER(al.title) LIKE '%' || LOWER(p_query) || '%' THEN 0.3
                ELSE 0.0
            END,
            -- Alias containment fallback
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM product_aliases pa3
                    WHERE pa3.product_id = al.id
                    AND LOWER(pa3.alias) LIKE '%' || LOWER(p_query) || '%'
                ) THEN 0.4
                ELSE 0.0
            END
        ) as match_score
    FROM affiliate_links al
    LEFT JOIN product_aliases pa ON al.id = pa.product_id
    WHERE al.site_id = p_site_id
      AND (
        -- Match in title using full-text search
        to_tsvector('english', al.title) @@ plainto_tsquery('english', p_query)
        OR 
        -- Match in aliases using full-text search
        EXISTS (
            SELECT 1 FROM product_aliases pa2 
            WHERE pa2.product_id = al.id 
            AND to_tsvector('english', pa2.alias) @@ plainto_tsquery('english', p_query)
        )
        OR
        -- Fallback: partial text match for flexibility
        (LOWER(al.title) LIKE '%' || LOWER(p_query) || '%')
        OR
        EXISTS (
            SELECT 1 FROM product_aliases pa3
            WHERE pa3.product_id = al.id
            AND LOWER(pa3.alias) LIKE '%' || LOWER(p_query) || '%'
        )
      )
    ORDER BY match_score DESC, al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 7. Add comment for documentation
COMMENT ON FUNCTION match_products_with_aliases IS 
'Server-side product matching with aliases support. Uses full-text search with fallback to similarity matching for optimal performance and accuracy.';