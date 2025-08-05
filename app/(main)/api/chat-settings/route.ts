import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { chatSettingsSchema, siteIdQuerySchema, sanitizeString, sanitizeHtml } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';

// Default chat settings
const DEFAULT_SETTINGS = {
  id: null,
  chat_name: 'Affi',
  chat_color: '#000000',
  chat_icon_url: null,
  chat_name_color: '#FFFFFF',
  chat_bubble_icon_color: '#FFFFFF',
  input_placeholder: 'Type your message...',
  font_size: '14px',
  intro_message: 'Hello! How can I help you today?',
  instructions: null,
  preferred_language: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// GET /api/chat-settings - Fetch chat settings for a site
export const GET = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    querySchema: siteIdQuerySchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { siteId, supabase } = context;
    
    // Fetch chat settings with retry logic
    const settings = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('chat_settings')
          .select('*')
          .eq('site_id', siteId!)
          .single();

        // If no settings found, return default settings
        if (error && error.code === 'PGRST116') {
          return {
            ...DEFAULT_SETTINGS,
            site_id: siteId
          };
        }

        if (error) throw error;
        return data;
      },
      { operation: 'fetchChatSettings', siteId, userId: context.userId }
    );

    return createSuccessResponse(settings, 'Chat settings fetched successfully');
  }
);

// PUT /api/chat-settings - Update chat settings for a site
export const PUT = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    bodySchema: chatSettingsSchema,
    allowedMethods: ['PUT']
  },
  async (context) => {
    const { body, siteId, supabase } = context;
    const settingsData = body as typeof chatSettingsSchema._type;

    // Sanitize user-generated content
    const sanitizedSettings = {
      chat_name: settingsData.chat_name ? sanitizeString(settingsData.chat_name) : undefined,
      chat_color: settingsData.chat_color,
      chat_icon_url: settingsData.chat_icon_url ? sanitizeString(settingsData.chat_icon_url) : undefined,
      chat_name_color: settingsData.chat_name_color,
      chat_bubble_icon_color: settingsData.chat_bubble_icon_color,
      input_placeholder: settingsData.input_placeholder ? sanitizeString(settingsData.input_placeholder) : undefined,
      font_size: settingsData.font_size,
      intro_message: settingsData.intro_message ? sanitizeHtml(settingsData.intro_message) : undefined,
      instructions: settingsData.instructions ? sanitizeHtml(settingsData.instructions) : undefined,
      preferred_language: settingsData.preferred_language ? sanitizeString(settingsData.preferred_language) : undefined
    };

    // Check if settings exist and update or create
    const result = await executeDBOperation(
      async () => {
        // Check if settings exist
        const { data: existingSettings, error: checkError } = await supabase
          .from('chat_settings')
          .select('id')
          .eq('site_id', siteId!)
          .maybeSingle();

        if (checkError) throw checkError;

        const settingsDataWithMeta = {
          ...sanitizedSettings,
          site_id: siteId!,
          updated_at: new Date().toISOString()
        };

        if (existingSettings) {
          // Update existing settings
          const { data, error } = await supabase
            .from('chat_settings')
            .update(settingsDataWithMeta)
            .eq('site_id', siteId!)
            .select('*')
            .single();

          if (error) throw error;
          return data;
        } else {
          // Insert new settings
          const { data, error } = await supabase
            .from('chat_settings')
            .insert({
              ...settingsDataWithMeta,
              created_at: new Date().toISOString()
            })
            .select('*')
            .single();

          if (error) throw error;
          return data;
        }
      },
      { operation: 'upsertChatSettings', siteId, userId: context.userId }
    );

    // Invalidate cache
    await cache.del(getCacheKey(siteId!, 'chat_settings'));
    console.log(`🗑️ Cache invalidated for chat settings: ${siteId}`);

    return createSuccessResponse(result, 'Chat settings updated successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();