-- Predefined Questions Feature Migration
-- This migration adds support for URL-targeted predefined questions

-- Enable UUID extension (should already exist)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Predefined questions table
CREATE TABLE predefined_questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (length(question) > 0 AND length(question) <= 500),
  answer TEXT NOT NULL CHECK (length(answer) > 0 AND length(answer) <= 2000),
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 100),
  is_site_wide BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Question URL rules table for pattern matching
CREATE TABLE question_url_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES predefined_questions(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('exact', 'contains', 'exclude')),
  pattern TEXT NOT NULL CHECK (length(pattern) > 0 AND length(pattern) <= 500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
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

-- Triggers for updated_at timestamps
CREATE TRIGGER update_predefined_questions_updated_at 
  BEFORE UPDATE ON predefined_questions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_question_url_rules_updated_at 
  BEFORE UPDATE ON question_url_rules 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add some helpful constraints
ALTER TABLE predefined_questions 
  ADD CONSTRAINT check_question_not_empty CHECK (trim(question) != ''),
  ADD CONSTRAINT check_answer_not_empty CHECK (trim(answer) != '');

ALTER TABLE question_url_rules 
  ADD CONSTRAINT check_pattern_not_empty CHECK (trim(pattern) != '');

-- Comment on tables for documentation
COMMENT ON TABLE predefined_questions IS 'Store predefined questions and answers for each site with URL targeting support';
COMMENT ON TABLE question_url_rules IS 'URL pattern matching rules for predefined questions (exact, contains, exclude)';

COMMENT ON COLUMN predefined_questions.priority IS 'Higher priority questions appear first (0-100)';
COMMENT ON COLUMN predefined_questions.is_site_wide IS 'If true, question appears on all pages unless excluded by URL rules';
COMMENT ON COLUMN question_url_rules.rule_type IS 'Type of URL matching: exact, contains, or exclude';
COMMENT ON COLUMN question_url_rules.pattern IS 'URL pattern to match against current page URL';