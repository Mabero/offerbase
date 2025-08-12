-- Add product aliases table for better product matching
-- This allows products to have multiple names/variations that can be matched

CREATE TABLE IF NOT EXISTS product_aliases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
    alias text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias_lower ON product_aliases(LOWER(alias));

-- Prevent duplicate aliases for the same product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_unique 
ON product_aliases(product_id, LOWER(alias));

-- Add some example aliases (these can be populated manually or via API)
-- Example: For a product titled "IVISKIN G3 IPL Hair Removal Device"
-- INSERT INTO product_aliases (product_id, alias) VALUES 
-- ('product-uuid', 'G3'),
-- ('product-uuid', 'IVISKIN G3'),
-- ('product-uuid', 'G3 IPL');

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_aliases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_aliases_updated_at
    BEFORE UPDATE ON product_aliases
    FOR EACH ROW
    EXECUTE PROCEDURE update_product_aliases_updated_at();

-- Add RLS policies if needed (matching affiliate_links patterns)
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;

-- Users can only access aliases for products they own
CREATE POLICY "Users can view their product aliases" ON product_aliases
FOR SELECT USING (
    product_id IN (
        SELECT id FROM affiliate_links 
        WHERE site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can insert their product aliases" ON product_aliases
FOR INSERT WITH CHECK (
    product_id IN (
        SELECT id FROM affiliate_links 
        WHERE site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can update their product aliases" ON product_aliases
FOR UPDATE USING (
    product_id IN (
        SELECT id FROM affiliate_links 
        WHERE site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can delete their product aliases" ON product_aliases
FOR DELETE USING (
    product_id IN (
        SELECT id FROM affiliate_links 
        WHERE site_id IN (
            SELECT id FROM sites WHERE user_id = auth.uid()
        )
    )
);