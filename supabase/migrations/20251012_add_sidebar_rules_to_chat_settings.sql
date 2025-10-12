-- Add sidebar_rules JSONB to chat_settings for server-driven sidebar visibility
ALTER TABLE chat_settings
ADD COLUMN IF NOT EXISTS sidebar_rules JSONB DEFAULT NULL;

COMMENT ON COLUMN chat_settings.sidebar_rules IS 'Sidebar visibility rules: { show_by_default: boolean, open_by_default: boolean, show_patterns: string[], hide_patterns: string[] }';

