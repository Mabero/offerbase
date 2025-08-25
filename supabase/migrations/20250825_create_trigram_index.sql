-- Trigram index for CJK/Thai multilingual fallback
-- Must be in separate migration because CONCURRENTLY cannot run in transactions

-- Create trigram index on training material chunks
CREATE INDEX idx_training_material_chunks_content_trgm 
  ON training_material_chunks 
  USING gin (content gin_trgm_ops);

-- Add comment
COMMENT ON INDEX idx_training_material_chunks_content_trgm IS 'Trigram index for multilingual search fallback (CJK/Thai scripts). Filtering by is_active is done at query time via JOIN to training_materials table.';