-- Make answer field optional in predefined_questions table
-- If answer is empty/null, AI will handle the question naturally

-- Remove the NOT NULL constraint from answer field
ALTER TABLE predefined_questions 
ALTER COLUMN answer DROP NOT NULL;

-- Remove the existing constraint that checks answer length
ALTER TABLE predefined_questions 
DROP CONSTRAINT IF EXISTS check_answer_not_empty;

-- Update the length check constraint to allow empty answers
ALTER TABLE predefined_questions 
DROP CONSTRAINT IF EXISTS predefined_questions_answer_check;

-- Add new constraint that allows empty/null answers but limits length when provided
ALTER TABLE predefined_questions 
ADD CONSTRAINT check_answer_length CHECK (answer IS NULL OR length(answer) <= 2000);

-- Update the comment to reflect the optional nature
COMMENT ON COLUMN predefined_questions.answer IS 'Optional predefined answer. If empty/null, AI will handle the question naturally. Max 2000 characters when provided.';