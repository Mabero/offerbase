-- Migration to support multiple embedding models with different dimensions
-- This creates additional columns for future embedding models

-- Add column for Cohere embeddings (1024 dimensions)
-- Commented out until needed to avoid unnecessary storage
-- ALTER TABLE training_material_chunks 
-- ADD COLUMN IF NOT EXISTS embedding_cohere vector(1024),
-- ADD COLUMN IF NOT EXISTS embedding_cohere_model VARCHAR(100);

-- Create a more flexible embedding storage approach using JSONB for future models
-- This allows storing embeddings of any dimension without schema changes
ALTER TABLE training_material_chunks 
ADD COLUMN IF NOT EXISTS embeddings_jsonb JSONB DEFAULT '{}';

-- Function to convert JSONB array to vector for similarity search
-- This allows flexible dimension handling at runtime
CREATE OR REPLACE FUNCTION jsonb_to_vector(embedding_jsonb JSONB)
RETURNS vector
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  arr FLOAT[];
BEGIN
  IF embedding_jsonb IS NULL OR embedding_jsonb = '{}'::jsonb THEN
    RETURN NULL;
  END IF;
  
  SELECT ARRAY_AGG(value::float)
  INTO arr
  FROM jsonb_array_elements_text(embedding_jsonb);
  
  RETURN arr::vector;
END;
$$;

-- Alternative search function that can handle different embedding dimensions
-- Uses JSONB storage for flexibility
CREATE OR REPLACE FUNCTION search_similar_chunks_flexible(
  query_embedding_jsonb JSONB,
  site_id_param UUID,
  embedding_model_param VARCHAR DEFAULT NULL,
  match_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB,
  material_id UUID,
  material_title TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  query_vec vector;
BEGIN
  -- Convert JSONB to vector
  query_vec := jsonb_to_vector(query_embedding_jsonb);
  
  IF query_vec IS NULL THEN
    RAISE EXCEPTION 'Invalid query embedding';
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id as chunk_id,
    c.content,
    1 - (jsonb_to_vector(c.embeddings_jsonb -> COALESCE(embedding_model_param, 'openai')) <=> query_vec) as similarity,
    c.metadata,
    tm.id as material_id,
    tm.title as material_title
  FROM training_material_chunks c
  JOIN training_materials tm ON c.training_material_id = tm.id
  WHERE tm.site_id = site_id_param
    AND tm.is_active = true
    AND c.embeddings_jsonb ? COALESCE(embedding_model_param, 'openai')
  ORDER BY jsonb_to_vector(c.embeddings_jsonb -> COALESCE(embedding_model_param, 'openai')) <=> query_vec
  LIMIT match_limit;
END;
$$;

-- Add comments for documentation
COMMENT ON COLUMN training_material_chunks.embeddings_jsonb IS 'Flexible storage for embeddings from different models as JSONB';
COMMENT ON FUNCTION jsonb_to_vector IS 'Converts JSONB array to vector type for similarity operations';
COMMENT ON FUNCTION search_similar_chunks_flexible IS 'Flexible search that can handle different embedding models and dimensions';