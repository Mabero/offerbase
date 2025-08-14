-- Fix the match_products_with_aliases function SQL syntax error
-- The issue: SELECT DISTINCT with ORDER BY match_score where match_score isn't in SELECT list

DROP FUNCTION IF EXISTS match_products_with_aliases(uuid, text, integer);

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
    SELECT DISTINCT ON (al.id)  -- Use DISTINCT ON to avoid duplicates properly
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
    ORDER BY al.id, match_score DESC  -- Order by al.id first for DISTINCT ON, then by score
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;