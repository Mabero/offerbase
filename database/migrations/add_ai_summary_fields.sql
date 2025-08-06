-- Migration to add AI-generated summary and analysis fields to training_materials table
-- This enhances the training system with intelligent content analysis

-- Add AI analysis columns to training_materials table
ALTER TABLE training_materials
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS key_points TEXT[],
ADD COLUMN IF NOT EXISTS intent_keywords TEXT[],
ADD COLUMN IF NOT EXISTS primary_products TEXT[],
ADD COLUMN IF NOT EXISTS confidence_score REAL DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '{}';

-- Add indexes for better query performance on AI-generated fields
CREATE INDEX IF NOT EXISTS idx_training_materials_intent_keywords ON training_materials USING GIN (intent_keywords);
CREATE INDEX IF NOT EXISTS idx_training_materials_primary_products ON training_materials USING GIN (primary_products);
CREATE INDEX IF NOT EXISTS idx_training_materials_confidence_score ON training_materials (confidence_score) WHERE confidence_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_training_materials_structured_data ON training_materials USING GIN (structured_data);

-- Update the full-text search to include summary and key points
-- Note: This updates the existing fts_content column if it exists
DO $$
BEGIN
  -- Check if fts_content column exists and update its generation expression
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'training_materials' 
    AND column_name = 'fts_content'
  ) THEN
    -- Drop and recreate the generated column with enhanced content
    ALTER TABLE training_materials DROP COLUMN fts_content;
    ALTER TABLE training_materials ADD COLUMN fts_content tsvector 
    GENERATED ALWAYS AS (
      to_tsvector('english', 
        COALESCE(title, '') || ' ' || 
        COALESCE(content, '') || ' ' || 
        COALESCE(summary, '') || ' ' ||
        COALESCE(array_to_string(key_points, ' '), '') || ' ' ||
        COALESCE(array_to_string(intent_keywords, ' '), '') || ' ' ||
        COALESCE(array_to_string(primary_products, ' '), '')
      )
    ) STORED;
    
    -- Recreate the GIN index
    CREATE INDEX IF NOT EXISTS idx_training_materials_fts 
    ON training_materials USING GIN (fts_content) 
    WHERE scrape_status = 'success';
  END IF;
END $$;

-- Update the training content view to include AI analysis fields
CREATE OR REPLACE VIEW training_content_view AS
SELECT 
    tm.id,
    tm.site_id,
    tm.url,
    tm.title,
    tm.content,
    tm.summary,
    tm.key_points,
    tm.intent_keywords,
    tm.primary_products,
    tm.confidence_score,
    tm.content_type,
    tm.metadata,
    tm.structured_data,
    tm.scrape_status,
    tm.last_scraped_at,
    tm.error_message,
    tm.created_at,
    tm.updated_at,
    s.name as site_name,
    s.user_id
FROM training_materials tm
JOIN sites s ON tm.site_id = s.id
WHERE tm.scrape_status = 'success' AND tm.content IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN training_materials.summary IS 'AI-generated summary of the content for quick understanding';
COMMENT ON COLUMN training_materials.key_points IS 'Array of key points extracted by AI for structured access';
COMMENT ON COLUMN training_materials.intent_keywords IS 'Keywords that help identify user intent and content matching';
COMMENT ON COLUMN training_materials.primary_products IS 'Product names/IDs mentioned in the content for product matching';
COMMENT ON COLUMN training_materials.confidence_score IS 'AI confidence score (0-1) for content analysis quality';
COMMENT ON COLUMN training_materials.structured_data IS 'Enhanced structured data from AI analysis including product info';

-- Create a function to get relevant training materials by intent
CREATE OR REPLACE FUNCTION get_relevant_training_materials(
    p_site_id UUID,
    p_query_keywords TEXT[],
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    summary TEXT,
    key_points TEXT[],
    confidence_score REAL,
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tm.id,
        tm.title,
        tm.summary,
        tm.key_points,
        tm.confidence_score,
        -- Calculate relevance based on keyword overlap
        (
            COALESCE(cardinality(tm.intent_keywords & p_query_keywords), 0) * 0.4 +
            COALESCE(cardinality(tm.primary_products & p_query_keywords), 0) * 0.6
        )::REAL as relevance_score
    FROM training_materials tm
    WHERE 
        tm.site_id = p_site_id 
        AND tm.scrape_status = 'success'
        AND tm.confidence_score > 0.3
        AND (
            tm.intent_keywords && p_query_keywords OR 
            tm.primary_products && p_query_keywords OR
            tm.fts_content @@ plainto_tsquery('english', array_to_string(p_query_keywords, ' '))
        )
    ORDER BY 
        relevance_score DESC,
        tm.confidence_score DESC,
        tm.updated_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the function
COMMENT ON FUNCTION get_relevant_training_materials IS 'Function to find most relevant training materials based on query keywords and AI analysis';