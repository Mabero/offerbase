-- Fix: Extract keywords from query for better matching
CREATE OR REPLACE FUNCTION match_products_with_aliases(
    p_site_id uuid,
    p_query text,
    p_limit integer DEFAULT 12
)
RETURNS TABLE (id uuid, title text, url text, image_url text, button_text text, description text, match_score float)
LANGUAGE plpgsql
AS $$
DECLARE
    query_words text[];
    word text;
BEGIN
    -- Extract meaningful words from query (ignore short words like "er", "bra")
    SELECT array_agg(word) INTO query_words
    FROM (
        SELECT unnest(string_to_array(lower(p_query), ' ')) as word
        WHERE length(unnest(string_to_array(lower(p_query), ' '))) >= 2
        AND unnest(string_to_array(lower(p_query), ' ')) NOT IN ('er', 'en', 'og', 'for', 'bra', 'god', 'best')
    ) words;

    RETURN QUERY
    SELECT al.id, al.title, al.url, al.image_url, 
           COALESCE(al.button_text, 'View Product')::text, 
           COALESCE(al.description, '')::text,
           1.0::float as match_score
    FROM affiliate_links al
    WHERE al.site_id = p_site_id
      AND (
        -- Check if ANY query word matches title
        EXISTS (
            SELECT 1 FROM unnest(query_words) as qw
            WHERE LOWER(al.title) LIKE '%' || qw || '%'
        )
        OR
        -- Check if ANY query word matches aliases  
        EXISTS (
            SELECT 1 FROM product_aliases pa, unnest(query_words) as qw
            WHERE pa.product_id = al.id 
            AND LOWER(pa.alias) LIKE '%' || qw || '%'
        )
      )
    LIMIT p_limit;
END;
$$;