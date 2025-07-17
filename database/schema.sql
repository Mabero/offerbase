-- Offerbase Database Schema
-- This schema creates the complete database structure for Clerk-Supabase integration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced from Clerk)
CREATE TABLE users (
  id TEXT PRIMARY KEY, -- Clerk user ID
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sites table (each user can have multiple sites)
CREATE TABLE sites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Affiliate links table (each site can have multiple links)
CREATE TABLE affiliate_links (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Training materials table (each site can have multiple materials)
CREATE TABLE training_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat settings table (each site has one chat configuration)
CREATE TABLE chat_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  chat_name TEXT DEFAULT 'Affi',
  chat_color TEXT DEFAULT '#000000',
  chat_icon_url TEXT,
  chat_name_color TEXT DEFAULT '#FFFFFF',
  chat_bubble_icon_color TEXT DEFAULT '#FFFFFF',
  input_placeholder TEXT DEFAULT 'Type your message...',
  font_size TEXT DEFAULT '14px',
  intro_message TEXT DEFAULT 'Hello! How can I help you today?',
  instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_id)
);

-- Tasks table (for testing Supabase integration)
CREATE TABLE tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_sites_user_id ON sites(user_id);
CREATE INDEX idx_affiliate_links_site_id ON affiliate_links(site_id);
CREATE INDEX idx_training_materials_site_id ON training_materials(site_id);
CREATE INDEX idx_chat_settings_site_id ON chat_settings(site_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_site_id ON tasks(site_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid()::text = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = id);

-- RLS Policies for sites table
CREATE POLICY "Users can view own sites" ON sites
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own sites" ON sites
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own sites" ON sites
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own sites" ON sites
  FOR DELETE USING (auth.uid()::text = user_id);

-- RLS Policies for affiliate_links table
CREATE POLICY "Users can view own affiliate links" ON affiliate_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = affiliate_links.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create affiliate links for own sites" ON affiliate_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = affiliate_links.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own affiliate links" ON affiliate_links
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = affiliate_links.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own affiliate links" ON affiliate_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = affiliate_links.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

-- RLS Policies for training_materials table
CREATE POLICY "Users can view own training materials" ON training_materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = training_materials.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create training materials for own sites" ON training_materials
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = training_materials.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own training materials" ON training_materials
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = training_materials.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own training materials" ON training_materials
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = training_materials.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

-- RLS Policies for chat_settings table
CREATE POLICY "Users can view own chat settings" ON chat_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = chat_settings.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can create chat settings for own sites" ON chat_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = chat_settings.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update own chat settings" ON chat_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = chat_settings.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete own chat settings" ON chat_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sites 
      WHERE sites.id = chat_settings.site_id 
      AND sites.user_id = auth.uid()::text
    )
  );

-- RLS Policies for tasks table
CREATE POLICY "Users can view own tasks" ON tasks
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own tasks" ON tasks
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own tasks" ON tasks
  FOR DELETE USING (auth.uid()::text = user_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at timestamps
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sites_updated_at 
  BEFORE UPDATE ON sites 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_affiliate_links_updated_at 
  BEFORE UPDATE ON affiliate_links 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_materials_updated_at 
  BEFORE UPDATE ON training_materials 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_settings_updated_at 
  BEFORE UPDATE ON chat_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();