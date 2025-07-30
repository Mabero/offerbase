-- Add AI improvement columns to training_materials
ALTER TABLE training_materials 
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS summarized_at TIMESTAMP WITH TIME ZONE;

-- Add product matching improvements to affiliate_links
ALTER TABLE affiliate_links
ADD COLUMN IF NOT EXISTS product_id TEXT,
ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add unique constraint on product_id
ALTER TABLE affiliate_links
ADD CONSTRAINT unique_product_id UNIQUE (product_id, site_id);

-- Add language tracking to chat_sessions
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS detected_language VARCHAR(10),
ADD COLUMN IF NOT EXISTS language_confidence FLOAT;

-- Create index for faster summary queries
CREATE INDEX IF NOT EXISTS idx_training_materials_summarized 
ON training_materials(site_id, summarized_at) 
WHERE summary IS NOT NULL;

-- Create index for product matching
CREATE INDEX IF NOT EXISTS idx_affiliate_links_product_id 
ON affiliate_links(site_id, product_id) 
WHERE product_id IS NOT NULL;