import { createServerSupabaseClient } from './supabase-server'

export interface User {
  id: string
  email: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  name: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface AffiliateLink {
  id: string
  url: string
  title: string
  description?: string
  site_id: string
  created_at: string
  updated_at: string
}

export interface TrainingMaterial {
  id: string
  url: string
  title: string
  site_id: string
  created_at: string
  updated_at: string
}

export interface ChatSettings {
  id: string
  site_id: string
  chat_name: string
  chat_color: string
  chat_icon_url?: string
  chat_name_color: string
  chat_bubble_icon_color: string
  input_placeholder: string
  font_size: string
  intro_message: string
  instructions?: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  name: string
  completed: boolean
  user_id: string
  site_id?: string
  created_at: string
  updated_at: string
}

// Sites
export async function getUserSites(userId: string): Promise<Site[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createSite(name: string, userId: string): Promise<Site> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sites')
    .insert({ name, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSite(siteId: string, name: string): Promise<Site> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('sites')
    .update({ name })
    .eq('id', siteId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteSite(siteId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('sites')
    .delete()
    .eq('id', siteId)

  if (error) throw error
}

// Affiliate Links
export async function getSiteAffiliateLinks(siteId: string): Promise<AffiliateLink[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createAffiliateLink(
  siteId: string,
  url: string,
  title: string,
  description?: string
): Promise<AffiliateLink> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('affiliate_links')
    .insert({ site_id: siteId, url, title, description })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateAffiliateLink(
  linkId: string,
  updates: Partial<Pick<AffiliateLink, 'url' | 'title' | 'description'>>
): Promise<AffiliateLink> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('affiliate_links')
    .update(updates)
    .eq('id', linkId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteAffiliateLink(linkId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('affiliate_links')
    .delete()
    .eq('id', linkId)

  if (error) throw error
}

// Training Materials
export async function getSiteTrainingMaterials(siteId: string): Promise<TrainingMaterial[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('training_materials')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createTrainingMaterial(
  siteId: string,
  url: string,
  title: string
): Promise<TrainingMaterial> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('training_materials')
    .insert({ site_id: siteId, url, title })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTrainingMaterial(materialId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('training_materials')
    .delete()
    .eq('id', materialId)

  if (error) throw error
}

// Chat Settings
export async function getSiteChatSettings(siteId: string): Promise<ChatSettings | null> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('chat_settings')
    .select('*')
    .eq('site_id', siteId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No chat settings found, return null
      return null
    }
    throw error
  }
  return data
}

export async function createOrUpdateChatSettings(
  siteId: string,
  settings: Partial<Omit<ChatSettings, 'id' | 'site_id' | 'created_at' | 'updated_at'>>
): Promise<ChatSettings> {
  const supabase = await createServerSupabaseClient()
  
  // Try to update first
  const { data: existingData, error: selectError } = await supabase
    .from('chat_settings')
    .select('id')
    .eq('site_id', siteId)
    .single()

  if (selectError && selectError.code !== 'PGRST116') {
    throw selectError
  }

  if (existingData) {
    // Update existing settings
    const { data, error } = await supabase
      .from('chat_settings')
      .update(settings)
      .eq('site_id', siteId)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    // Create new settings
    const { data, error } = await supabase
      .from('chat_settings')
      .insert({ site_id: siteId, ...settings })
      .select()
      .single()

    if (error) throw error
    return data
  }
}

// Tasks
export async function getUserTasks(userId: string): Promise<Task[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createTask(
  name: string,
  userId: string,
  siteId?: string
): Promise<Task> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ name, user_id: userId, site_id: siteId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTask(
  taskId: string,
  updates: Partial<Pick<Task, 'name' | 'completed'>>
): Promise<Task> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw error
}