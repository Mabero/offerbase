-- Enhanced content intelligence for training materials
ALTER TABLE training_materials 
ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'general',
ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS intent_keywords TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS primary_products TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS confidence_score FLOAT DEFAULT 0.0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_training_materials_content_type 
ON training_materials(site_id, content_type);

CREATE INDEX IF NOT EXISTS idx_training_materials_intent_keywords 
ON training_materials USING GIN(intent_keywords);

CREATE INDEX IF NOT EXISTS idx_training_materials_primary_products 
ON training_materials USING GIN(primary_products);

CREATE INDEX IF NOT EXISTS idx_training_materials_confidence 
ON training_materials(site_id, confidence_score DESC);

-- Create index for structured data queries
CREATE INDEX IF NOT EXISTS idx_training_materials_structured_data 
ON training_materials USING GIN(structured_data);