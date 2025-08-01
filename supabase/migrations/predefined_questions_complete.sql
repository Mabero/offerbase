-- Complete Predefined Questions Feature Migration
-- This is a comprehensive migration that creates the entire predefined questions system
-- with optional answer field from the beginning

-- Enable UUID extension (should already exist but ensure it's available)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create predefined questions table
-- Note: answer field is optional from the start - if empty/null, AI handles the question naturally
CREATE TABLE predefined_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  
  -- Question text (required, 1-500 characters)
  question TEXT NOT NULL CHECK (length(trim(question)) > 0 AND length(question) <= 500),
  
  -- Answer text (optional, max 2000 characters when provided)
  -- If NULL or empty, AI will handle the question naturally
  answer TEXT CHECK (answer IS NULL OR length(answer) <= 2000),
  
  -- Priority for ordering (0-100, higher numbers appear first)
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 100),
  
  -- Whether this question appears on all pages by default
  is_site_wide BOOLEAN DEFAULT false,
  
  -- Whether this question is active/enabled
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create question URL rules table for pattern matching
CREATE TABLE question_url_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES predefined_questions(id) ON DELETE CASCADE,
  
  -- Type of URL matching rule
  rule_type TEXT NOT NULL CHECK (rule_type IN ('exact', 'contains', 'exclude')),
  
  -- URL pattern to match (1-500 characters)
  pattern TEXT NOT NULL CHECK (length(trim(pattern)) > 0 AND length(pattern) <= 500),
  
  -- Whether this rule is active
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX idx_predefined_questions_site_id ON predefined_questions(site_id);
CREATE INDEX idx_predefined_questions_active ON predefined_questions(site_id, is_active) WHERE is_active = true;
CREATE INDEX idx_predefined_questions_site_wide ON predefined_questions(site_id, is_site_wide, is_active) WHERE is_site_wide = true AND is_active = true;
CREATE INDEX idx_predefined_questions_priority ON predefined_questions(site_id, priority DESC, is_active) WHERE is_active = true;

CREATE INDEX idx_question_url_rules_question_id ON question_url_rules(question_id);
CREATE INDEX idx_question_url_rules_type ON question_url_rules(question_id, rule_type, is_active) WHERE is_active = true;
CREATE INDEX idx_question_url_rules_pattern ON question_url_rules(rule_type, pattern) WHERE is_active = true;

-- Enable Row Level Security
ALTER TABLE predefined_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_url_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for predefined_questions table
-- Users can only access questions for sites they own
CREATE POLICY "Users can view own predefined questions" ON predefined_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = predefined_questions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create predefined questions for own sites" ON predefined_questions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = predefined_questions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own predefined questions" ON predefined_questions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = predefined_questions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own predefined questions" ON predefined_questions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = predefined_questions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

-- RLS Policies for question_url_rules table
-- Users can only access URL rules for questions they own
CREATE POLICY "Users can view own question URL rules" ON question_url_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM predefined_questions 
      JOIN sites ON sites.id = predefined_questions.site_id
      WHERE predefined_questions.id = question_url_rules.question_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create question URL rules for own questions" ON question_url_rules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM predefined_questions 
      JOIN sites ON sites.id = predefined_questions.site_id
      WHERE predefined_questions.id = question_url_rules.question_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own question URL rules" ON question_url_rules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM predefined_questions 
      JOIN sites ON sites.id = predefined_questions.site_id
      WHERE predefined_questions.id = question_url_rules.question_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own question URL rules" ON question_url_rules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM predefined_questions 
      JOIN sites ON sites.id = predefined_questions.site_id
      WHERE predefined_questions.id = question_url_rules.question_id 
      AND sites.user_id = auth.uid()::text
    )
  );

-- Create triggers for automatic updated_at timestamp updates
-- Only create if the update_updated_at_column function exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE TRIGGER update_predefined_questions_updated_at 
            BEFORE UPDATE ON predefined_questions 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        CREATE TRIGGER update_question_url_rules_updated_at 
            BEFORE UPDATE ON question_url_rules 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            
        RAISE NOTICE 'Created updated_at triggers successfully';
    ELSE
        RAISE NOTICE 'update_updated_at_column function not found - triggers not created';
        RAISE NOTICE 'You may need to create the function manually if automatic timestamps are needed';
    END IF;
END $$;

-- Add helpful constraints with descriptive names
ALTER TABLE predefined_questions 
  ADD CONSTRAINT check_question_not_empty CHECK (trim(question) != '');

ALTER TABLE question_url_rules 
  ADD CONSTRAINT check_pattern_not_empty CHECK (trim(pattern) != '');

-- Add comprehensive comments for documentation
COMMENT ON TABLE predefined_questions IS 'Store predefined questions for each site with URL targeting support. Questions can have optional answers - if answer is NULL/empty, AI handles the question naturally.';
COMMENT ON TABLE question_url_rules IS 'URL pattern matching rules for predefined questions. Supports exact match, contains, and exclude patterns.';

-- Column comments
COMMENT ON COLUMN predefined_questions.question IS 'The question text shown to users (required, 1-500 characters)';
COMMENT ON COLUMN predefined_questions.answer IS 'Optional predefined answer. If NULL/empty, AI will handle the question naturally. Max 2000 characters when provided.';
COMMENT ON COLUMN predefined_questions.priority IS 'Display priority (0-100). Higher priority questions appear first.';
COMMENT ON COLUMN predefined_questions.is_site_wide IS 'If true, question appears on all pages by default (unless excluded by URL rules)';
COMMENT ON COLUMN predefined_questions.is_active IS 'Whether this question is currently active and should be displayed';

COMMENT ON COLUMN question_url_rules.rule_type IS 'Type of URL matching: "exact" (exact URL match), "contains" (URL contains pattern), "exclude" (hide question on matching URLs)';
COMMENT ON COLUMN question_url_rules.pattern IS 'URL pattern to match against. Examples: "/products/", "https://example.com/page", "/checkout"';
COMMENT ON COLUMN question_url_rules.is_active IS 'Whether this URL rule is currently active';

-- Output success message
SELECT 'Predefined questions migration completed successfully!' as message,
       'Tables created: predefined_questions, question_url_rules' as tables_created,
       'Features: Optional answers, URL targeting, RLS security, performance indexes' as features;