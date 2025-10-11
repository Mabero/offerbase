import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { generateSmartAliases } from '@/lib/alias-generator';
import { invalidateSiteDomainTerms } from '@/lib/ai/domain-guard';
import { syncAffiliateToOffer } from '@/lib/offers/sync';

// GET /api/affiliate-links - Fetch affiliate links for a site
export async function GET(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get siteId from query params
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Fetch affiliate links (aliases support will be added after migration)
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('id, url, title, description, image_url, button_text, created_at, updated_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Affiliate links query error:', error);
      return NextResponse.json({ error: 'Failed to fetch affiliate links', details: error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });

  } catch (error) {
    console.error('Affiliate links API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}

  // POST /api/affiliate-links - Create new affiliate link
  export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { siteId, url, title, description, image_url, button_text } = body;
    
    if (!siteId || !url || !title) {
      return NextResponse.json({ error: 'siteId, url, and title are required' }, { status: 400 });
    }

    // Create simple Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found or unauthorized' }, { status: 404 });
    }

    // Create affiliate link
    const { data, error } = await supabase
      .from('affiliate_links')
      .insert([{
        site_id: siteId,
        url: url.trim(),
        title: title.trim(),
        description: description?.trim() || '',
        image_url: image_url?.trim() || null,
        button_text: button_text?.trim() || 'View Product'
      }])
      .select('id, url, title, description, image_url, button_text, created_at, updated_at')
      .single();

    if (error) {
      console.error('Affiliate link creation error:', error);
      return NextResponse.json({ error: 'Failed to create affiliate link', details: error }, { status: 500 });
    }

    // Auto-generate aliases for better product matching
    if (data && data.id) {
      try {
        const aliases = generateSmartAliases(title);
        console.log(`Generated ${aliases.length} aliases for "${title}":`, aliases);
        
        if (aliases.length > 0) {
          // Prepare bulk insert for aliases
          const aliasInserts = aliases.map(alias => ({
            product_id: data.id,
            alias: alias
          }));
          
          // Insert aliases (ignore errors as they're non-critical)
          const { error: aliasError } = await supabase
            .from('product_aliases')
            .insert(aliasInserts);
          
          if (aliasError) {
            console.warn('Failed to create aliases (non-critical):', aliasError);
          } else {
            console.log(`Successfully created ${aliases.length} aliases for product ${data.id}`);
          }

          // Keep the stateless offers system in sync so the widget can match immediately
          try {
            await syncAffiliateToOffer(supabase, {
              siteId,
              title: title.trim(),
              url: url.trim(),
              description: (description || '').trim(),
              manualAliases: aliases
            });
          } catch (syncErr) {
            console.warn('Offer sync (create) warning:', syncErr);
          }
        }
      } catch (aliasGenerationError) {
        // Don't fail the product creation if alias generation fails
        console.error('Alias generation error (non-critical):', aliasGenerationError);
      }
    }

    // Invalidate domain guard so affiliate titles can be considered in derived terms
    try { await invalidateSiteDomainTerms(siteId); } catch {}

    return NextResponse.json({ success: true, data }, { status: 201 });

  } catch (error) {
    console.error('Affiliate links API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
