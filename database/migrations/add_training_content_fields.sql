-- Migration to add content storage fields to training_materials table
-- This enhances the training system to store scraped content and metadata

-- Add new columns to training_materials table
ALTER TABLE training_materials
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'webpage',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending' CHECK (scrape_status IN ('pending', 'processing', 'success', 'failed')),
ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_training_materials_site_id_status ON training_materials(site_id, scrape_status);
CREATE INDEX IF NOT EXISTS idx_training_materials_content_gin ON training_materials USING GIN (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_training_materials_metadata ON training_materials USING GIN (metadata);

-- Add a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to training_materials if not exists
DROP TRIGGER IF EXISTS update_training_materials_updated_at ON training_materials;
CREATE TRIGGER update_training_materials_updated_at 
BEFORE UPDATE ON training_materials 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Create a view for easily accessible training content
CREATE OR REPLACE VIEW training_content_view AS
SELECT 
    tm.id,
    tm.site_id,
    tm.url,
    tm.title,
    tm.content,
    tm.content_type,
    tm.metadata,
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

-- Add comment for documentation
COMMENT ON TABLE training_materials IS 'Stores training materials including scraped content for AI training';
COMMENT ON COLUMN training_materials.content IS 'The scraped and cleaned content from the URL';
COMMENT ON COLUMN training_materials.content_type IS 'Type of content: webpage, article, product, faq, etc.';
COMMENT ON COLUMN training_materials.metadata IS 'JSON metadata including title, description, images, structured data';
COMMENT ON COLUMN training_materials.scrape_status IS 'Status of content scraping: pending, processing, success, failed';
COMMENT ON COLUMN training_materials.last_scraped_at IS 'Timestamp of last successful scrape';
COMMENT ON COLUMN training_materials.error_message IS 'Error details if scraping failed';