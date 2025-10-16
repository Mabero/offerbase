-- Ensure brand-only aliases exist even when brand is NULL by deriving
-- the first meaningful token from the title. Also backfill existing rows.
-- Idempotent and safe: uses ON CONFLICT DO NOTHING.

BEGIN;

-- Upgrade trigger function to add brand-only alias fallback from title
CREATE OR REPLACE FUNCTION generate_offer_aliases()
RETURNS TRIGGER AS $$
DECLARE
  v_first_token TEXT;
  v_first_token_norm TEXT;
BEGIN
  -- Remove all auto-generated aliases; keep manual ones
  DELETE FROM offer_aliases 
  WHERE offer_id = NEW.id 
    AND alias_type != 'manual';

  -- 1) Title exact
  INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
  VALUES (NEW.id, NEW.site_id, NEW.title, 'title_exact');

  -- 2) Brand + Model (when both present)
  IF NEW.brand IS NOT NULL AND NEW.model IS NOT NULL THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.brand || ' ' || NEW.model, 'brand_model');
  END IF;

  -- 3) Model only (when present)
  IF NEW.model IS NOT NULL THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.model, 'model_only');
  END IF;

  -- 4) Brand only
  IF NEW.brand IS NOT NULL AND length(normalize_text(NEW.brand)) >= 2 THEN
    INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
    VALUES (NEW.id, NEW.site_id, NEW.brand, 'brand_only');
  ELSE
    -- Derive fallback brand from first token of the title
    -- Normalize whitespace then take first space-separated token
    v_first_token := split_part(trim(regexp_replace(COALESCE(NEW.title,''), '\\s+', ' ', 'g')), ' ', 1);
    v_first_token_norm := normalize_text(v_first_token);
    -- Require a minimally meaningful token (>= 3 after normalization)
    IF v_first_token IS NOT NULL AND length(v_first_token_norm) >= 3 THEN
      INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
      VALUES (NEW.id, NEW.site_id, v_first_token, 'brand_only');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (no-op if already exists) to ensure new function is used
DROP TRIGGER IF EXISTS auto_generate_aliases ON offers;
CREATE TRIGGER auto_generate_aliases
  AFTER INSERT OR UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION generate_offer_aliases();

-- Backfill: add brand_only fallback for existing offers that lack it
INSERT INTO offer_aliases (offer_id, site_id, alias, alias_type)
SELECT o.id,
       o.site_id,
       split_part(trim(regexp_replace(o.title, '\\s+', ' ', 'g')), ' ', 1) AS alias,
       'brand_only'::alias_type_enum
FROM offers o
LEFT JOIN offer_aliases oa
  ON oa.offer_id = o.id
 AND oa.alias_type = 'brand_only'
WHERE oa.id IS NULL
  AND (o.brand IS NULL OR length(trim(o.brand)) = 0)
  AND length(normalize_text(split_part(trim(regexp_replace(o.title, '\\s+', ' ', 'g')), ' ', 1))) >= 3
ON CONFLICT (offer_id, alias_norm) DO NOTHING;

COMMIT;

