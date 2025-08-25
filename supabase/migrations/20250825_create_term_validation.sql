-- Term validation function for corpus-aware search
-- Validates terms against actual content and filters by document frequency (IDF)

CREATE OR REPLACE FUNCTION validate_search_terms(
  p_terms text[],
  p_site_id uuid
) RETURNS jsonb AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  term text;
  doc_count integer;
  total_docs integer;
  doc_frequency float;
  idf_threshold float;
  term_result jsonb;
BEGIN
  -- Get IDF threshold from environment or default to 30%
  idf_threshold := COALESCE(current_setting('app.idf_threshold', true)::float, 0.3);
  
  -- Get total active document count for site
  SELECT COUNT(DISTINCT c.training_material_id) INTO total_docs
  FROM training_material_chunks c
  JOIN training_materials m ON c.training_material_id = m.id
  WHERE m.site_id = p_site_id AND m.is_active = true;
  
  -- Return empty if no docs
  IF total_docs = 0 THEN
    RETURN result;
  END IF;
  
  -- Validate each term
  FOR term IN SELECT unnest(p_terms) LOOP
    -- Count documents containing this term (use raw term, not normalized)
    SELECT COUNT(DISTINCT c.training_material_id) INTO doc_count
    FROM training_material_chunks c
    JOIN training_materials m ON c.training_material_id = m.id
    WHERE m.site_id = p_site_id
      AND m.is_active = true
      AND to_tsvector('simple', c.content) @@ 
          plainto_tsquery('simple', term);
    
    -- Calculate document frequency
    doc_frequency := doc_count::float / total_docs::float;
    
    -- Build result object
    IF doc_count > 0 AND doc_frequency <= idf_threshold THEN
      -- Term exists and isn't too common - keep it
      term_result := jsonb_build_object(
        'term', term,
        'doc_frequency', doc_frequency,
        'kept', true
      );
    ELSIF doc_count > 0 THEN
      -- Term exists but is too common - drop it
      term_result := jsonb_build_object(
        'term', term,
        'doc_frequency', doc_frequency,
        'kept', false,
        'reason', 'high_frequency'
      );
    ELSE
      -- Term doesn't exist in corpus
      term_result := jsonb_build_object(
        'term', term,
        'doc_frequency', 0.0,
        'kept', false,
        'reason', 'not_found'
      );
    END IF;
    
    -- Append to result array (proper JSONB array building)
    result := result || jsonb_build_array(term_result);
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION validate_search_terms IS 'Validates search terms against corpus content and filters by document frequency to remove overly common terms';

-- Ensure required indexes exist for performance
-- (These should already exist from previous migrations)

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts 
  ON training_material_chunks 
  USING GIN(to_tsvector('simple', content));

-- Site filtering indexes  
CREATE INDEX IF NOT EXISTS idx_materials_site_active 
  ON training_materials(site_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chunks_material_id 
  ON training_material_chunks(training_material_id);

-- Trigram index for non-Latin script fallback
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm 
  ON training_material_chunks 
  USING GIN(content gin_trgm_ops);