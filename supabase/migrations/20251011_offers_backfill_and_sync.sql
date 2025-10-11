-- Backfill and keep offers system in sync with existing affiliate_links/product_aliases
-- 1) Create missing offers from affiliate_links (by site_id + title)
-- 2) Copy product_aliases to offer_aliases as manual (matched by site_id + title)

BEGIN;

-- 1) Insert offers for any affiliate_links that don't already exist by (site_id, title)
INSERT INTO offers (site_id, title, url, description)
SELECT al.site_id, al.title, al.url, COALESCE(al.description, '')
FROM affiliate_links al
LEFT JOIN offers o
  ON o.site_id = al.site_id
 AND o.title = al.title
WHERE o.id IS NULL;

-- NOTE: The AFTER INSERT trigger on offers will auto-generate non-manual aliases

-- 2) Copy product_aliases (manual) into offer_aliases
--    Match affiliate_links to offers by site_id + title; insert manual aliases
INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
SELECT o.id AS offer_id,
       o.site_id,
       pa.alias,
       'manual'::alias_type_enum
FROM product_aliases pa
JOIN affiliate_links al ON pa.product_id = al.id
JOIN offers o ON o.site_id = al.site_id AND o.title = al.title
ON CONFLICT (offer_id, alias_norm) DO NOTHING;

COMMIT;

