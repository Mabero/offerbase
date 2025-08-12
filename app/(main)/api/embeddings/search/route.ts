import { NextRequest, NextResponse } from 'next/server';
import { VectorSearchService } from '@/lib/embeddings/search';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { 
      query, 
      siteId, 
      options = {},
      conversationHistory 
    } = await request.json();
    
    if (!query || !siteId) {
      return NextResponse.json(
        { error: 'query and siteId are required' },
        { status: 400 }
      );
    }
    
    // Note: This endpoint is called by the chat widget, so we don't require auth
    // The siteId acts as the authorization - only public sites can be searched
    
    // Verify site exists and is active
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .single();
    
    if (siteError || !site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }
    
    // Initialize search service
    const searchService = new VectorSearchService();
    
    // Perform search
    let results;
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Search with conversation context
      results = await searchService.searchWithContext(
        query,
        conversationHistory,
        siteId,
        options
      );
    } else {
      // Regular hybrid search
      results = await searchService.hybridSearch(
        query,
        siteId,
        options
      );
    }
    
    // Log search for analytics (optional)
    try {
      await supabase
        .from('search_logs')
        .insert({
          site_id: siteId,
          query,
          results_count: results.length,
          has_context: !!conversationHistory,
          options: options,
        });
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('Failed to log search:', logError);
    }
    
    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}

// Find similar chunks endpoint
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chunkId = searchParams.get('chunkId');
    const limit = parseInt(searchParams.get('limit') || '5');
    
    if (!chunkId) {
      return NextResponse.json(
        { error: 'chunkId is required' },
        { status: 400 }
      );
    }
    
    // Initialize search service
    const searchService = new VectorSearchService();
    
    // Find similar chunks
    const results = await searchService.findSimilarChunks(chunkId, limit);
    
    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Find similar error:', error);
    return NextResponse.json(
      { error: 'Failed to find similar chunks' },
      { status: 500 }
    );
  }
}