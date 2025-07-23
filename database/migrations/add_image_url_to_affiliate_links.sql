-- Add image_url column to affiliate_links table
ALTER TABLE affiliate_links 
ADD COLUMN image_url TEXT;

-- Add comment to document the column
COMMENT ON COLUMN affiliate_links.image_url IS 'Optional URL for product image to display in chat widget';