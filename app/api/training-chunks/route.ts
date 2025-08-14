import { NextRequest, NextResponse } from 'next/server';
import { VectorSearchService } from '@/lib/embeddings/search';
import {
  verifySiteToken,
  getRequestOrigin,
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type SiteToken
} from '@/lib/widget-auth';

/**
 * Get training chunks for context-aware product matching
 * POST /api/training-chunks
 * 
 * Requires: Bearer JWT token from bootstrap endpoint
 * Returns: Training chunks for keyword extraction
 */
export async function POST(request: NextRequest) {
  try {
    // Extract and verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Bearer token required' }, 
        { 
          status: 401,
          headers: getCORSHeaders(getRequestOrigin(request), [])
        }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken: SiteToken | null = verifySiteToken(token);
    
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Invalid or expired token' }, 
        { 
          status: 401,
          headers: getCORSHeaders(getRequestOrigin(request), [])
        }
      );
    }

    // Validate origin matches token
    const origin = getRequestOrigin(request);
    if (!origin || origin !== decodedToken.origin) {
      return NextResponse.json(
        { error: 'Origin mismatch' }, 
        { 
          status: 403,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Parse request body
    const body = await request.json();
    const { query, conversationHistory = [] } = body;
    const siteId = decodedToken.siteId;
    
    if (!query) {
      return NextResponse.json(
        { error: 'query parameter is required' }, 
        { 
          status: 400,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    '127.0.0.1';
    const rateLimitKey = getRateLimitKey(`chunks:${siteId}`, clientIP);
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    
    if (!isLocalhost && !rateLimiter.isAllowed(rateLimitKey, 30, 60000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for training chunks' }, 
        { 
          status: 429,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Use vector search to get relevant training chunks
    const searchService = new VectorSearchService();
    
    const searchResults = await searchService.searchWithContext(
      query,
      conversationHistory,
      siteId,
      {
        vectorWeight: 0.6,
        limit: 10,
        useReranker: false,
        similarityThreshold: 0.1,
      }
    );

    // Format chunks for context keyword extraction
    const chunks = searchResults.map(r => ({
      content: r.content,
      materialTitle: r.materialTitle
    }));

    console.log(`🧠 Retrieved ${chunks.length} training chunks for context matching`);

    return NextResponse.json({ 
      success: true, 
      data: chunks,
      query: query.trim(),
      count: chunks.length
    }, {
      headers: getCORSHeaders(origin, [])
    });

  } catch (error) {
    console.error('Training chunks API error:', error);
    
    const origin = getRequestOrigin(request);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : String(error))
          : undefined
      }, 
      { 
        status: 500,
        headers: getCORSHeaders(origin, [])
      }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  
  return new NextResponse(null, {
    status: 200,
    headers: getCORSHeaders(origin, ['*'])
  });
}