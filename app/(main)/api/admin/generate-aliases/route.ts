import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { generateSmartAliases } from '@/lib/alias-generator';

// POST /api/admin/generate-aliases - Generate aliases for all existing products
export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { siteId, batchSize = 50 } = body;
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Create Supabase client
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

    // Fetch all products for this site that don't have aliases yet
    const { data: products, error: productsError } = await supabase
      .from('affiliate_links')
      .select('id, title')
      .eq('site_id', siteId)
      .limit(batchSize);

    if (productsError) {
      console.error('Failed to fetch products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No products found for this site',
        processed: 0
      });
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const product of products) {
      try {
        // Check if product already has aliases
        const { data: existingAliases } = await supabase
          .from('product_aliases')
          .select('id')
          .eq('product_id', product.id)
          .limit(1);

        if (existingAliases && existingAliases.length > 0) {
          skippedCount++;
          results.push({
            productId: product.id,
            title: product.title,
            status: 'skipped',
            reason: 'Already has aliases'
          });
          continue;
        }

        // Generate aliases
        const aliases = generateSmartAliases(product.title);
        
        if (aliases.length === 0) {
          skippedCount++;
          results.push({
            productId: product.id,
            title: product.title,
            status: 'skipped',
            reason: 'No aliases generated'
          });
          continue;
        }

        // Insert aliases
        const aliasInserts = aliases.map(alias => ({
          product_id: product.id,
          alias: alias
        }));

        const { error: insertError } = await supabase
          .from('product_aliases')
          .insert(aliasInserts);

        if (insertError) {
          errorCount++;
          results.push({
            productId: product.id,
            title: product.title,
            status: 'error',
            error: insertError.message
          });
        } else {
          processedCount++;
          results.push({
            productId: product.id,
            title: product.title,
            status: 'success',
            aliasesGenerated: aliases.length,
            aliases: aliases
          });
        }

      } catch (error) {
        errorCount++;
        results.push({
          productId: product.id,
          title: product.title,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProducts: products.length,
        processed: processedCount,
        skipped: skippedCount,
        errors: errorCount
      },
      results: results
    });

  } catch (error) {
    console.error('Generate aliases API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}