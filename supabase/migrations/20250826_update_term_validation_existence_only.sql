-- Update term validation to existence-only (no IDF filtering)
-- P0: Security hardening with schema qualification and safe search_path
-- P1: Phrase path consistency with phraseto_tsquery for bigrams

-- Drop the old function first
DROP FUNCTION IF EXISTS validate_search_terms(text[], uuid);

-- Create new existence-only validation function with security hardening
CREATE OR REPLACE FUNCTION validate_search_terms(
  p_terms text[],
  p_site_id uuid
) RETURNS jsonb AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  term text;
  doc_count integer;
BEGIN
  -- Validate each term against corpus
  FOR term IN SELECT unnest(p_terms) LOOP
    -- P1: Use different query types for phrases vs single tokens
    IF position(' ' IN term) > 0 THEN
      -- Bigram/phrase - use phraseto_tsquery for exact phrase matching
      -- This ensures consistency with runtime FTS query building
      SELECT COUNT(DISTINCT c.training_material_id) INTO doc_count
      FROM public.training_material_chunks c
      JOIN public.training_materials m ON c.training_material_id = m.id
      WHERE m.site_id = p_site_id
        AND m.is_active = true
        AND to_tsvector('simple', c.content) @@ 
            phraseto_tsquery('simple', term);
    ELSE
      -- Single token - use plainto_tsquery for flexibility
      SELECT COUNT(DISTINCT c.training_material_id) INTO doc_count
      FROM public.training_material_chunks c
      JOIN public.training_materials m ON c.training_material_id = m.id
      WHERE m.site_id = p_site_id
        AND m.is_active = true
        AND to_tsvector('simple', c.content) @@ 
            plainto_tsquery('simple', term);
    END IF;
    
    -- Build result object - keep if exists, drop if not (NO frequency filtering)
    result := result || jsonb_build_array(
      jsonb_build_object(
        'term', term,
        'doc_count', doc_count,
        'kept', doc_count > 0,
        'reason', CASE WHEN doc_count = 0 THEN 'not_found' ELSE NULL END
      )
    );
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog, public;

-- Add comment for documentation
COMMENT ON FUNCTION validate_search_terms IS 'Validates search terms by existence in corpus only. No IDF filtering - keeps all terms that exist regardless of frequency. Uses phrase queries for bigrams and plain queries for single tokens.';

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION validate_search_terms TO service_role;

-- Ensure required indexes exist for performance
-- Full-text search index for plainto_tsquery
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts 
  ON public.training_material_chunks 
  USING GIN(to_tsvector('simple', content));

-- Site filtering indexes  
CREATE INDEX IF NOT EXISTS idx_materials_site_active 
  ON public.training_materials(site_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chunks_material_id 
  ON public.training_material_chunks(training_material_id);

-- Ensure pg_trgm extension is enabled for non-Latin fallback
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for non-Latin script fallback
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm 
  ON public.training_material_chunks 
  USING GIN(content gin_trgm_ops);