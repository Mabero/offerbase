-- Completely replace the broken function with a simpler working version
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
    WITH scored_products AS (
        SELECT 
            al.id,
            al.title,
            al.url,
            al.image_url,
            COALESCE(al.button_text, 'View Product') as button_text,
            COALESCE(al.description, '') as description,
            GREATEST(
                -- Title matches
                CASE 
                    WHEN LOWER(al.title) LIKE '%' || LOWER(p_query) || '%' THEN 1.0
                    ELSE 0.0
                END,
                -- Alias matches  
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM product_aliases pa
                        WHERE pa.product_id = al.id
                        AND LOWER(pa.alias) LIKE '%' || LOWER(p_query) || '%'
                    ) THEN 1.5
                    ELSE 0.0
                END
            ) as match_score
        FROM affiliate_links al
        WHERE al.site_id = p_site_id
          AND (
            LOWER(al.title) LIKE '%' || LOWER(p_query) || '%'
            OR EXISTS (
                SELECT 1 FROM product_aliases pa
                WHERE pa.product_id = al.id
                AND LOWER(pa.alias) LIKE '%' || LOWER(p_query) || '%'
            )
          )
    )
    SELECT 
        sp.id,
        sp.title,
        sp.url,
        sp.image_url,
        sp.button_text,
        sp.description,
        sp.match_score
    FROM scored_products sp
    WHERE sp.match_score > 0
    ORDER BY sp.match_score DESC, sp.title
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;