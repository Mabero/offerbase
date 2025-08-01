-- Complete cleanup script for predefined questions tables
-- Run this first to remove all existing objects completely

-- Disable RLS temporarily to avoid conflicts during cleanup
ALTER TABLE IF EXISTS question_url_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS predefined_questions DISABLE ROW LEVEL SECURITY;

-- Drop all RLS policies for question_url_rules table
DROP POLICY IF EXISTS "Users can view own question URL rules" ON question_url_rules;
DROP POLICY IF EXISTS "Users can create question URL rules for own questions" ON question_url_rules;
DROP POLICY IF EXISTS "Users can update own question URL rules" ON question_url_rules;
DROP POLICY IF EXISTS "Users can delete own question URL rules" ON question_url_rules;

-- Drop all RLS policies for predefined_questions table
DROP POLICY IF EXISTS "Users can view own predefined questions" ON predefined_questions;
DROP POLICY IF EXISTS "Users can create predefined questions for own sites" ON predefined_questions;
DROP POLICY IF EXISTS "Users can update own predefined questions" ON predefined_questions;
DROP POLICY IF EXISTS "Users can delete own predefined questions" ON predefined_questions;

-- Drop all triggers
DROP TRIGGER IF EXISTS update_question_url_rules_updated_at ON question_url_rules;
DROP TRIGGER IF EXISTS update_predefined_questions_updated_at ON predefined_questions;

-- Drop all indexes
DROP INDEX IF EXISTS idx_question_url_rules_pattern;
DROP INDEX IF EXISTS idx_question_url_rules_type;
DROP INDEX IF EXISTS idx_question_url_rules_question_id;
DROP INDEX IF EXISTS idx_predefined_questions_priority;
DROP INDEX IF EXISTS idx_predefined_questions_site_wide;
DROP INDEX IF EXISTS idx_predefined_questions_active;
DROP INDEX IF EXISTS idx_predefined_questions_site_id;

-- Drop tables (CASCADE will handle foreign key dependencies)
DROP TABLE IF EXISTS question_url_rules CASCADE;
DROP TABLE IF EXISTS predefined_questions CASCADE;

-- Output confirmation message
SELECT 'Cleanup completed successfully. All predefined questions objects have been removed.' as message;