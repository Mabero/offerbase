-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create chunks table for flexible embedding storage
CREATE TABLE IF NOT EXISTS training_material_chunks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  training_material_id UUID REFERENCES training_materials(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension (we'll handle different dimensions at app level)
  embedding_model VARCHAR(100),
  embedding_dimension INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(training_material_id, chunk_index)
);

-- Add embedding metadata to parent table (no fixed vector dimension)
ALTER TABLE training_materials 
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
ADD COLUMN IF NOT EXISTS embedding_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create HNSW index for fast similarity search (better than IVFFlat)
-- Note: Index requires specific dimension
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw 
ON training_material_chunks 
USING hnsw (embedding vector_cosine_ops)
WHERE embedding IS NOT NULL;

-- Create full-text search index for hybrid search
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts 
ON training_material_chunks 
USING GIN (to_tsvector('english', content));

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_chunks_material_id 
ON training_material_chunks(training_material_id);

-- Index for active materials
CREATE INDEX IF NOT EXISTS idx_training_materials_active 
ON training_materials(site_id, is_active) 
WHERE is_active = true;

-- Function to search similar chunks using cosine similarity
CREATE OR REPLACE FUNCTION search_similar_chunks(
  query_embedding vector(1536),
  site_id_param UUID,
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
BEGIN
  RETURN QUERY
  SELECT 
    c.id as chunk_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity, -- Convert distance to similarity
    c.metadata,
    tm.id as material_id,
    tm.title as material_title
  FROM training_material_chunks c
  JOIN training_materials tm ON c.training_material_id = tm.id
  WHERE tm.site_id = site_id_param
    AND tm.is_active = true
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding -- Cosine distance
  LIMIT match_limit;
END;
$$;

-- Function for hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search_chunks(
  query_embedding vector(1536),
  query_text TEXT,
  site_id_param UUID,
  match_limit INTEGER DEFAULT 10,
  vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  combined_score FLOAT,
  vector_similarity FLOAT,
  text_rank FLOAT,
  metadata JSONB,
  material_id UUID,
  material_title TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT 
      c.id,
      c.content,
      c.metadata,
      c.training_material_id,
      1 - (c.embedding <=> query_embedding) as similarity
    FROM training_material_chunks c
    JOIN training_materials tm ON c.training_material_id = tm.id
    WHERE tm.site_id = site_id_param
      AND tm.is_active = true
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_limit * 2
  ),
  text_search AS (
    SELECT 
      c.id,
      c.content,
      c.metadata,
      c.training_material_id,
      ts_rank_cd(to_tsvector('english', c.content), plainto_tsquery('english', query_text)) as rank
    FROM training_material_chunks c
    JOIN training_materials tm ON c.training_material_id = tm.id
    WHERE tm.site_id = site_id_param
      AND tm.is_active = true
      AND to_tsvector('english', c.content) @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC
    LIMIT match_limit * 2
  ),
  combined AS (
    SELECT 
      COALESCE(v.id, t.id) as chunk_id,
      COALESCE(v.content, t.content) as content,
      COALESCE(v.metadata, t.metadata) as metadata,
      COALESCE(v.training_material_id, t.training_material_id) as training_material_id,
      COALESCE(v.similarity, 0) as vector_similarity,
      COALESCE(t.rank, 0) as text_rank,
      (COALESCE(v.similarity, 0) * vector_weight + 
       COALESCE(t.rank, 0) * (1 - vector_weight)) as combined_score
    FROM vector_search v
    FULL OUTER JOIN text_search t ON v.id = t.id
  )
  SELECT 
    c.chunk_id,
    c.content,
    c.combined_score,
    c.vector_similarity,
    c.text_rank,
    c.metadata,
    tm.id as material_id,
    tm.title as material_title
  FROM combined c
  JOIN training_materials tm ON c.training_material_id = tm.id
  ORDER BY c.combined_score DESC
  LIMIT match_limit;
END;
$$;

-- Add updated_at trigger for chunks table
CREATE TRIGGER update_chunks_updated_at 
BEFORE UPDATE ON training_material_chunks 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE training_material_chunks IS 'Stores document chunks with embeddings for vector similarity search';
COMMENT ON COLUMN training_material_chunks.embedding IS 'Vector embedding with flexible dimensions based on model';
COMMENT ON COLUMN training_material_chunks.embedding_model IS 'Model used to generate embedding (e.g., openai-text-embedding-3-small)';
COMMENT ON COLUMN training_material_chunks.embedding_dimension IS 'Dimension of the embedding vector';
COMMENT ON COLUMN training_material_chunks.chunk_index IS 'Order of chunk within the parent document';
COMMENT ON FUNCTION search_similar_chunks IS 'Find chunks similar to query embedding using cosine similarity';
COMMENT ON FUNCTION hybrid_search_chunks IS 'Hybrid search combining vector similarity and full-text search';