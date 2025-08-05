import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { siteCreateSchema } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { auth } from '@clerk/nextjs/server';

// GET /api/sites - Fetch sites for authenticated user
export const GET = createAPIRoute(
  {
    requireAuth: true,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { supabase, userId } = context;
    
    // Fetch sites with retry logic
    const sites = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('sites')
          .select('id, name, description, created_at, updated_at')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
      },
      { operation: 'fetchSites', userId }
    );

    return createSuccessResponse(sites, 'Sites fetched successfully');
  }
);

// POST /api/sites - Create new site
export const POST = createAPIRoute(
  {
    requireAuth: true,
    bodySchema: siteCreateSchema,
    allowedMethods: ['POST']
  },
  async (context) => {
    const { body, supabase, userId } = context;
    const siteData = body as typeof siteCreateSchema._type;

    // First ensure the user exists in the users table
    await executeDBOperation(
      async () => {
        const { sessionClaims } = await auth();
        const userEmail = sessionClaims?.email as string || `${userId}@clerk.local`;
        
        const { error } = await supabase
          .from('users')
          .upsert([{
            id: userId!,
            email: userEmail,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }], {
            onConflict: 'id'
          });

        if (error) throw error;
      },
      { operation: 'ensureUserExists', userId }
    );

    // Create the site with retry logic
    const site = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('sites')
          .insert([{
            name: siteData.name.trim(),
            description: siteData.description?.trim() || null,
            user_id: userId!
          }])
          .select('id, name, description, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'createSite', userId }
    );

    // Create default chat settings for the new site (non-blocking)
    executeDBOperation(
      async () => {
        const { error } = await supabase
          .from('chat_settings')
          .insert([{
            site_id: site.id,
            chat_name: 'Affi',
            chat_color: '#000000',
            chat_name_color: '#FFFFFF',
            chat_bubble_icon_color: '#FFFFFF',
            input_placeholder: 'Type your message...',
            font_size: '14px',
            intro_message: 'Hello! How can I help you today?'
          }]);
        
        if (error) throw error;
      },
      { operation: 'createDefaultChatSettings', siteId: site.id, userId }
    ).catch(error => {
      // Log the error but don't fail the site creation
      console.error('Error creating default chat settings:', error);
    });

    return createSuccessResponse(site, 'Site created successfully', 201);
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();