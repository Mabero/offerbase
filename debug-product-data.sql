-- Phase 1: Verify Data Integrity
-- Run these queries one by one to see exactly what data exists

-- 1. Check your exact product data and aliases
SELECT 
    al.id as product_id,
    al.site_id, 
    al.title,
    array_agg(pa.alias) as aliases,
    array_agg(pa.product_id) as alias_product_ids,
    COUNT(pa.alias) as alias_count
FROM affiliate_links al
LEFT JOIN product_aliases pa ON pa.product_id = al.id  
WHERE al.title ILIKE '%iviskin%'
GROUP BY al.id, al.site_id, al.title;

-- 2. Check if product belongs to the site being queried
SELECT 
    'Products for this site' as check_type,
    COUNT(*) as count
FROM affiliate_links 
WHERE site_id = 'c2310349-8379-41da-ad48-09acac767413';

-- 3. Check alias-product relationship specifically for G3
SELECT 
    pa.alias,
    pa.product_id,
    al.title,
    al.site_id,
    al.id = pa.product_id as "foreign_key_valid"
FROM product_aliases pa
LEFT JOIN affiliate_links al ON al.id = pa.product_id
WHERE LOWER(pa.alias) = 'g3';

-- 4. Check all aliases for your site
SELECT 
    al.title,
    al.site_id,
    pa.alias
FROM affiliate_links al
JOIN product_aliases pa ON pa.product_id = al.id
WHERE al.site_id = 'c2310349-8379-41da-ad48-09acac767413'
ORDER BY al.title;

-- 5. Test simple title matching (should work regardless of aliases)
SELECT 
    id,
    title,
    site_id
FROM affiliate_links 
WHERE site_id = 'c2310349-8379-41da-ad48-09acac767413'
AND LOWER(title) LIKE '%iviskin%';