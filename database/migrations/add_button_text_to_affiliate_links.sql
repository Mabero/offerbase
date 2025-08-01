-- Add button_text column to affiliate_links table for customizable CTA buttons
-- This allows users to customize the call-to-action text in product boxes

ALTER TABLE affiliate_links ADD COLUMN button_text TEXT DEFAULT 'View Product';

-- Add comment for documentation
COMMENT ON COLUMN affiliate_links.button_text IS 'Customizable call-to-action button text for product boxes';