-- Essential SQL functions for Universal Resolution System
-- This ensures normalize_text exists even without the offers system

-- Create normalize_text function (matches TypeScript implementation exactly)
CREATE OR REPLACE FUNCTION normalize_text(input TEXT)
RETURNS TEXT AS $$
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  RETURN trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(input),
                '[æ]', 'ae', 'g'),
              '[ø]', 'oe', 'g'),
            '[å]', 'aa', 'g'),
          '[ä]', 'ae', 'g'),
        '[ö]', 'oe', 'g'),
      '([a-z])[\s\-\.]+(\d)', '\1\2', 'g'),  -- g-3 → g3
    '\s+', ' ', 'g'  -- Multiple spaces → single
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment
COMMENT ON FUNCTION normalize_text IS 'Universal text normalization: lowercase, Nordic transliteration (æøå→aeoeaa), collapse separators (g-3→g3), normalize whitespace. Must match TypeScript implementation exactly.';