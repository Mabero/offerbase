-- Schema Extensions for Analytics, Chat Sessions, and Real-time Features
-- This file adds missing tables for complete functionality

-- Analytics events table for tracking user interactions
CREATE TABLE analytics_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'widget_open', 'message_sent', 'link_click', 'session_start', 'session_end'
  user_session_id TEXT, -- Anonymous session identifier
  user_agent TEXT,
  ip_address INET,
  event_data JSONB, -- Flexible data for event-specific information
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions table for tracking conversations
CREATE TABLE chat_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_session_id TEXT NOT NULL, -- Anonymous session identifier
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  user_agent TEXT,
  ip_address INET,
  is_active BOOLEAN DEFAULT TRUE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table for storing conversation history
CREATE TABLE chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table for tracking anonymous users across visits
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY, -- Session identifier
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  page_views INTEGER DEFAULT 1,
  user_agent TEXT,
  ip_address INET,
  referrer TEXT
);

-- Indexes for performance
CREATE INDEX idx_analytics_events_site_id ON analytics_events(site_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_events_session ON analytics_events(user_session_id);

CREATE INDEX idx_chat_sessions_site_id ON chat_sessions(site_id);
CREATE INDEX idx_chat_sessions_user_session ON chat_sessions(user_session_id);
CREATE INDEX idx_chat_sessions_started_at ON chat_sessions(started_at);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(is_active);

CREATE INDEX idx_chat_messages_session_id ON chat_messages(chat_session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

CREATE INDEX idx_user_sessions_site_id ON user_sessions(site_id);
CREATE INDEX idx_user_sessions_last_seen ON user_sessions(last_seen);

-- Enable Row Level Security
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analytics_events table
CREATE POLICY "Users can view own site analytics events" ON analytics_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = analytics_events.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Analytics events can be inserted for any site" ON analytics_events
  FOR INSERT WITH CHECK (true); -- Allow anonymous insertion for tracking

-- RLS Policies for chat_sessions table
CREATE POLICY "Users can view own site chat sessions" ON chat_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = chat_sessions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Chat sessions can be inserted for any site" ON chat_sessions
  FOR INSERT WITH CHECK (true); -- Allow anonymous insertion

CREATE POLICY "Chat sessions can be updated for any site" ON chat_sessions
  FOR UPDATE USING (true); -- Allow anonymous updates for session management

-- RLS Policies for chat_messages table
CREATE POLICY "Users can view own site chat messages" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs
      JOIN sites s ON s.id = cs.site_id
      WHERE cs.id = chat_messages.chat_session_id 
      AND s.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Chat messages can be inserted for any session" ON chat_messages
  FOR INSERT WITH CHECK (true); -- Allow anonymous insertion

-- RLS Policies for user_sessions table
CREATE POLICY "Users can view own site user sessions" ON user_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = user_sessions.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "User sessions can be inserted for any site" ON user_sessions
  FOR INSERT WITH CHECK (true); -- Allow anonymous insertion

CREATE POLICY "User sessions can be updated for any site" ON user_sessions
  FOR UPDATE USING (true); -- Allow anonymous updates

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates
CREATE TRIGGER update_chat_sessions_activity
  BEFORE UPDATE ON chat_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_session_activity();

CREATE TRIGGER update_user_sessions_activity
  BEFORE UPDATE ON user_sessions 
  FOR EACH ROW EXECUTE FUNCTION update_user_session_activity();

-- Function to automatically update message count when messages are added
CREATE OR REPLACE FUNCTION update_session_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_sessions 
    SET message_count = message_count + 1,
        last_activity_at = NOW()
    WHERE id = NEW.chat_session_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE chat_sessions 
    SET message_count = message_count - 1
    WHERE id = OLD.chat_session_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update message count
CREATE TRIGGER update_message_count_trigger
  AFTER INSERT OR DELETE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_session_message_count();