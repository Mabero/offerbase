import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { filterProductsWithAI, shouldEnableAIFiltering } from '@/lib/ai/product-filter';
import { extractContextKeywords, extractQueryKeywords, type TrainingChunk } from '@/lib/context-keywords';
import { productConfig, logProductConfig } from '@/lib/config/products';
import { detectIntent, extractBrandMentions } from '@/lib/ai/intent-detector';
import { 
  verifySiteToken, 
  getRequestOrigin, 
  isOriginAllowed,
  isWidgetRequestAllowed, 
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type SiteToken
} from '@/lib/widget-auth';

interface MatchedProduct {
  id: string;
  title: string;
  url: string;
  image_url?: string;
  button_text: string;
  description?: string;
  match_type?: string; // 'exact' | 'alias' | 'fuzzy'
  match_score?: number;
  // Page context enhancement fields
  contextBoost?: number;
  originalScore?: number;
  confidenceScore?: number;
}

interface ClarificationOption {
  category: string;
  products: MatchedProduct[];
  displayName: string;
}

interface PageContextConfig {
  enabled: boolean;
  boostFactor: number; // 0.10-0.25 range
  marginThreshold: number; // 0.10 = 10% of leader score
  confidenceThreshold: number; // 0.7 default
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Smart tokenization that preserves important alphanumeric codes
 */
function tokenizeForContextMatching(text: string, aliasMap?: Set<string>): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Keep hyphens for normalization
    .split(/\s+/)
    .map(word => word.replace(/-/g, ' ')) // Normalize hyphens to spaces
    .join(' ')
    .split(/\s+/)
    .filter(token => {
      // Keep tokens that are:
      // 1. Length >= 3 (normal words)
      // 2. Length >= 2 with digits (4K, etc.)
      // 3. In alias map (known product codes)
      return token.length >= 3 || 
             (token.length >= 2 && /\d/.test(token)) ||
             (aliasMap && aliasMap.has(token.toUpperCase()));
    })
    .filter(Boolean);
}

/**
 * Get alias map from database for smart tokenization
 */
async function getAliasMap(siteId: string): Promise<Set<string>> {
  try {
    // Query aliases through the affiliate_links relationship
    const { data: aliases } = await supabase
      .from('product_aliases')
      .select(`
        alias,
        affiliate_links!inner(site_id)
      `)
      .eq('affiliate_links.site_id', siteId);
      
    return new Set((aliases || []).map(a => a.alias.toUpperCase()));
  } catch (error) {
    console.warn('Failed to load alias map, using empty set:', error);
    return new Set();
  }
}

/**
 * Apply intelligent page context boost using multiplicative scoring and margin re-ranking
 */
async function applyPageContextBoost(
  products: MatchedProduct[], 
  pageContext?: { title?: string; description?: string; url?: string },
  siteId?: string,
  config: PageContextConfig = { enabled: true, boostFactor: 0.15, marginThreshold: 0.10, confidenceThreshold: 0.7 }
): Promise<MatchedProduct[]> {
  if (!config.enabled || !pageContext || (!pageContext.title && !pageContext.description)) {
    // No page context or disabled, return products with original scores stored
    return products.map(p => ({ ...p, originalScore: p.match_score, contextBoost: 0 }));
  }
  
  // Get alias map for smart tokenization
  const aliasMap: Set<string> = siteId ? await getAliasMap(siteId) : new Set<string>();
  
  // Tokenize page content intelligently  
  const pageText = `${pageContext.title || ''} ${pageContext.description || ''}`;
  const pageTokens = new Set(tokenizeForContextMatching(pageText, aliasMap));
  
  // Store original scores and apply multiplicative boost
  const boostedProducts = products.map(product => {
    const originalScore = product.match_score || 0;
    let contextBoost = 0;
    
    // Tokenize product title intelligently
    const productTokens = tokenizeForContextMatching(product.title, aliasMap);
    const matchingTokens = productTokens.filter(token => pageTokens.has(token));
    
    if (matchingTokens.length > 0) {
      // Calculate boost factor based on token matches (bounded by config)
      const matchRatio = matchingTokens.length / Math.max(productTokens.length, 1);
      contextBoost = Math.min(config.boostFactor, matchRatio * config.boostFactor);
    }
    
    // Apply multiplicative boost: score *= (1 + boost_factor)
    const boostedScore = originalScore * (1 + contextBoost);
    
    return {
      ...product,
      originalScore,
      contextBoost,
      match_score: boostedScore
    };
  });
  
  // Margin re-ranker: Only allow reordering within top candidates and score margin
  const topScore = Math.max(...boostedProducts.map(p => p.originalScore || 0));
  const marginThreshold = topScore * config.marginThreshold;
  
  // Split into re-rankable and fixed groups
  const reRankable = boostedProducts.filter(p => (p.originalScore || 0) >= topScore - marginThreshold);
  const fixed = boostedProducts.filter(p => (p.originalScore || 0) < topScore - marginThreshold);
  
  // Sort re-rankable group by boosted score, keep fixed group in original order
  reRankable.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  
  return [...reRankable, ...fixed];
}

/**
 * Calculate data-driven confidence score for clarification decisions
 */
function calculateConfidenceScore(
  products: MatchedProduct[], 
  query: string,
  config: PageContextConfig
): { confidence: number; shouldAskClarification: boolean; reason: string } {
  if (products.length <= 1) {
    return { confidence: 1.0, shouldAskClarification: false, reason: 'single_result' };
  }
  
  const topScore = products[0]?.match_score || 0;
  const secondScore = products[1]?.match_score || 0;
  const topType = products[0]?.match_type || 'unknown';
  const secondType = products[1]?.match_type || 'unknown';
  
  // Calculate score gap as percentage of top score
  const scoreGap = topScore > 0 ? (topScore - secondScore) / topScore : 0;
  
  // Base confidence from score gap
  let confidence = Math.min(1.0, scoreGap / 0.1); // 10% gap = full confidence
  
  // Query ambiguity factors
  const queryTokens = query.trim().split(/\s+/);
  const isShortQuery = queryTokens.length <= 2;
  const isSingleToken = queryTokens.length === 1;
  
  // Reduce confidence for ambiguous queries
  if (isSingleToken) {
    confidence *= 0.7; // Single tokens are often ambiguous
  } else if (isShortQuery) {
    confidence *= 0.85; // Short queries need more scrutiny
  }
  
  // Match type considerations
  if (topType === 'exact' && scoreGap > 0.2) {
    confidence = Math.max(confidence, 0.9); // Exact matches with good gap are reliable
  } else if (topType === 'alias' && secondType === 'alias') {
    confidence *= 0.8; // Multiple alias matches are often ambiguous
  }
  
  // Check for different product categories
  const topTitle = products[0]?.title.toLowerCase() || '';
  const secondTitle = products[1]?.title.toLowerCase() || '';
  const seemsDifferentProducts = !topTitle.includes(secondTitle.split(' ')[0]) && 
                                 !secondTitle.includes(topTitle.split(' ')[0]);
  
  if (seemsDifferentProducts && scoreGap < 0.15) {
    confidence *= 0.6; // Different products with close scores = ambiguous
  }
  
  // Clarification decision
  const shouldAskClarification = confidence < config.confidenceThreshold && products.length >= 2;
  
  let reason = 'high_confidence';
  if (shouldAskClarification) {
    if (scoreGap < 0.05) reason = 'close_scores';
    else if (isSingleToken) reason = 'single_token';
    else if (seemsDifferentProducts) reason = 'different_categories';
    else reason = 'low_confidence';
  }
  
  return { confidence, shouldAskClarification, reason };
}

/**
 * Generate clarification options from ambiguous products
 */
function generateClarificationOptions(products: MatchedProduct[]): ClarificationOption[] {
  // Simple generic grouping - just return all products as one group
  const options: ClarificationOption[] = [];
  
  if (products.length > 0) {
    options.push({
      category: 'products',
      products: products,
      displayName: 'Products'
    });
  }
  
  return options;
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  
  return new NextResponse(null, {
    status: 200,
    headers: getCORSHeaders(origin, ['*']) // Allow all origins for OPTIONS
  });
}

/**
 * Secure product matching endpoint for widgets
 * POST /api/products/match
 * 
 * Requires: Bearer JWT token from bootstrap endpoint
 * Returns: AI-filtered product recommendations with aliases support
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
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
      console.warn(`Origin mismatch`, { 
        tokenOrigin: decodedToken.origin, 
        requestOrigin: origin 
      });
      
      return NextResponse.json(
        { error: 'Origin mismatch' }, 
        { 
          status: 403,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Parse request body - support both old and new API formats
    const body = await request.json();
    const { 
      query, 
      limit = 12,
      aiText, // Full AI response text for exact matching
      contextKeywords, // Pre-extracted context keywords
      trainingChunks, // Raw training chunks for keyword extraction
      pageContext // Page title, description, URL for enhanced context
    } = body;
    const siteId = decodedToken.siteId; // Use siteId from token, not request body
    
    // Initialize config
    if (productConfig.debug) {
      logProductConfig();
    }
    
    // Detect intent early to help with debugging
    let intentResult = null;
    if (productConfig.intent.enabled && query) {
      intentResult = detectIntent(query.trim());
      
      // Early exit if intent suggests no products should be shown
      if (!intentResult.shouldShowProducts) {
        return NextResponse.json({
          success: true,
          data: [],
          query: query.trim(),
          count: 0,
          candidatesCount: 0,
          aiFiltered: false,
          intentSuppressed: true,
          intentReason: intentResult.reason
        }, {
          headers: getCORSHeaders(origin, allowedOrigins)
        });
      }
    }
    
    if (!query) {
      return NextResponse.json(
        { error: 'query parameter is required' }, 
        { 
          status: 400,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    '127.0.0.1';

    // Get site configuration for rate limiting
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('allowed_origins, widget_rate_limit_per_minute, widget_enabled')
      .eq('id', siteId)
      .eq('widget_enabled', true)
      .single();

    if (siteError || !site) {
      console.warn(`Product match failed: site not found or disabled`, { siteId });
      return NextResponse.json(
        { error: 'Site not found or widget disabled' }, 
        { 
          status: 404,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Double-check origin is still allowed (defense in depth)
    const allowedOrigins: string[] = site.allowed_origins || [];
    const validationResult = isWidgetRequestAllowed(origin, decodedToken.parentOrigin || null, allowedOrigins);
    if (!validationResult.allowed) {
      console.error(`🚫 Product match failed: ${validationResult.reason}`, { 
        siteId, 
        origin,
        parentOrigin: decodedToken.parentOrigin,
        allowedOrigins,
        validationReason: validationResult.reason
      });
      return NextResponse.json(
        { error: validationResult.reason || 'Origin not allowed' }, 
        { 
          status: 403,
          headers: getCORSHeaders(origin, allowedOrigins)
        }
      );
    }

    // Apply rate limiting for product searches - skip for localhost development
    const rateLimitKey = getRateLimitKey(`products:${siteId}`, clientIP);
    const rateLimit = site.widget_rate_limit_per_minute || 60;
    
    // Skip rate limiting for localhost development
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    
    if (!isLocalhost && !rateLimiter.isAllowed(rateLimitKey, rateLimit, 60000)) {
      console.warn(`Product search rate limited`, { siteId, origin, clientIP });
      
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making more requests.' }, 
        { 
          status: 429,
          headers: {
            ...getCORSHeaders(origin, allowedOrigins),
            'Retry-After': '60'
          }
        }
      );
    }

    // Context-aware product matching with intelligent hierarchy
    
    // Get training chunks for context (keeping existing approach)
    let contextChunks: TrainingChunk[] = [];
    if (trainingChunks && Array.isArray(trainingChunks)) {
      contextChunks = trainingChunks;
    } else {
      // Fetch training chunks from vector search using normal query (no concatenation)
      try {
        const { VectorSearchService } = await import('@/lib/embeddings/search');
        const searchService = new VectorSearchService();
        
        const searchResults = await searchService.searchWithContext(
          query, // Use original query, not concatenated
          [], // No conversation history in product matching
          siteId,
          {
            vectorWeight: 0.6,
            limit: 8, // Standard limit
            useReranker: false,
            similarityThreshold: 0.15, // Standard threshold
          }
        );
        
        contextChunks = searchResults.map(r => ({
          content: r.content,
          materialTitle: r.materialTitle
        }));
        
      } catch (searchError) {
        console.warn('Failed to fetch training chunks for context:', searchError);
        contextChunks = [];
      }
    }
    
    // Extract context keywords from chunks
    let finalContextKeywords: string[] = [];
    if (contextKeywords && Array.isArray(contextKeywords)) {
      finalContextKeywords = contextKeywords;
    } else if (contextChunks.length > 0) {
      finalContextKeywords = extractContextKeywords(contextChunks, query);
    } else {
      // Fallback: extract basic keywords from query
      finalContextKeywords = extractQueryKeywords(query);
    }
    
    const candidateLimit = Math.min(limit * 2, 20);
    
    
    // Use new contextual matching function
    const { data: matchedProducts, error } = await supabase
      .rpc('match_products_contextual', {
        p_site_id: siteId,
        p_query: query.trim(),
        p_ai_text: aiText || query, // Use AI response if available, fallback to query
        p_context_keywords: finalContextKeywords,
        p_limit: candidateLimit
      });


    if (error) {
      console.error('Product matching RPC error:', error);
      
      // Fallback: try direct query with aliases
      const { data: fallbackProducts, error: fallbackError } = await supabase
        .from('affiliate_links')
        .select(`
          id, 
          title, 
          url, 
          image_url, 
          button_text,
          description,
          product_aliases!inner(alias)
        `)
        .eq('site_id', siteId)
        .or(
          `title.ilike.%${query.trim()}%,product_aliases.alias.ilike.%${query.trim()}%`
        )
        .limit(Math.min(limit, 20));

      if (fallbackError) {
        console.warn('Aliases fallback failed, trying simple title match');
        
        // Final fallback: simple title matching
        const { data: simpleFallback, error: simpleError } = await supabase
          .from('affiliate_links')
          .select('id, title, url, image_url, button_text, description')
          .eq('site_id', siteId)
          .ilike('title', `%${query.trim()}%`)
          .limit(Math.min(limit, 20));

        if (simpleError) {
          console.error('All fallback matching failed:', simpleError);
          return NextResponse.json(
            { error: 'Failed to match products' }, 
            { 
              status: 500,
              headers: getCORSHeaders(origin, allowedOrigins)
            }
          );
        }

        // Return simple fallback results
        return NextResponse.json({ 
          success: true, 
          data: simpleFallback || [],
          query: query.trim(),
          count: (simpleFallback || []).length,
          candidatesCount: (simpleFallback || []).length,
          aiFiltered: false,
          fallback: 'simple'
        }, {
          headers: getCORSHeaders(origin, allowedOrigins)
        });
      }

      // Return aliases fallback results
      return NextResponse.json({ 
        success: true, 
        data: fallbackProducts || [],
        query: query.trim(),
        count: (fallbackProducts || []).length,
        candidatesCount: (fallbackProducts || []).length,
        aiFiltered: false,
        fallback: 'aliases'
      }, {
        headers: getCORSHeaders(origin, allowedOrigins)
      });
    }

    // Map matched products to standard format with context-aware metadata
    const candidates: MatchedProduct[] = (matchedProducts || []).map((product: any) => ({
      id: product.id,
      title: product.title,
      url: product.url,
      image_url: product.image_url,
      button_text: product.button_text || 'View Product',
      description: product.description || '',
      match_type: product.match_type, // 'exact', 'alias', or 'fuzzy'
      match_score: product.match_score
    }));

    // Apply AI filtering for context-aware results
    let finalProducts = candidates;
    const enableAI = shouldEnableAIFiltering();
    
    if (enableAI && candidates.length > 1) {
      try {
        finalProducts = await filterProductsWithAI(candidates, query.trim(), true);
      } catch (aiError) {
        console.warn('AI filtering failed, using all candidates:', aiError);
        finalProducts = candidates; // Graceful fallback
      }
    }

    // Apply page context scoring boost to enhance relevance
    const config: PageContextConfig = {
      enabled: true, // TODO: Get from site settings or feature flag
      boostFactor: 0.15,
      marginThreshold: productConfig.confidence.marginThreshold,
      confidenceThreshold: productConfig.confidence.threshold
    };

    // Limit final results to requested amount before processing
    const limitedProducts = finalProducts.slice(0, limit);
    
    // Apply page context boost
    const scoredProducts = await applyPageContextBoost(limitedProducts, pageContext, siteId, config);
    
    // Calculate confidence score for clarification decisions
    const { confidence, shouldAskClarification, reason } = calculateConfidenceScore(scoredProducts, query, config);
    
    // Generate clarification options if needed
    const clarificationOptions = shouldAskClarification ? generateClarificationOptions(scoredProducts.slice(0, 6)) : [];

    // Comprehensive telemetry logging (after all processing is complete)
    const telemetryData = {
      // Query & context
      query: query.trim(),
      queryLength: query.trim().split(/\s+/).length,
      pageContext: pageContext ? {
        hasTitle: !!pageContext.title,
        hasDescription: !!pageContext.description,
        titleLength: pageContext.title?.length || 0
      } : null,
      
      // Scoring & ranking
      candidates: {
        count: candidates.length,
        topKBefore: candidates.slice(0, 3).map(p => ({
          title: p.title,
          score: p.match_score,
          type: p.match_type
        })),
        topKAfter: scoredProducts.slice(0, 3).map(p => ({
          title: p.title,
          originalScore: p.originalScore,
          boostedScore: p.match_score,
          boost: p.contextBoost,
          type: p.match_type
        }))
      },
      
      // Clarification system
      clarification: {
        shouldAsk: shouldAskClarification,
        confidence: confidence,
        reason: reason,
        optionsCount: clarificationOptions.length
      },
      
      // Performance & config
      responseTime: Date.now() - startTime,
      aiFiltered: enableAI && candidates.length > 1,
      config: config,
      
      // Site context
      siteId,
      origin
    };

    
    // TODO: Send to analytics service in production
    // await analyticsService.track('product_match', telemetryData);

    return NextResponse.json({ 
      success: true, 
      data: scoredProducts,
      query: query.trim(),
      count: scoredProducts.length,
      candidatesCount: candidates.length,
      aiFiltered: enableAI && candidates.length > 1,
      // Enhanced clarification system
      clarification: {
        shouldAsk: shouldAskClarification,
        confidence: confidence,
        reason: reason,
        options: clarificationOptions
      },
      contextualMatching: {
        contextKeywords: finalContextKeywords,
        matchTypes: scoredProducts.map(p => p.match_type),
        hasExactMatches: scoredProducts.some(p => p.match_type === 'exact'),
        hasAliasMatches: scoredProducts.some(p => p.match_type === 'alias'),
        hasFuzzyMatches: scoredProducts.some(p => p.match_type === 'fuzzy'),
        pageContextUsed: pageContext && (pageContext.title || pageContext.description),
        boostConfig: config
      }
    }, {
      headers: {
        ...getCORSHeaders(origin, allowedOrigins),
        'Cache-Control': 'public, max-age=30' // Cache hot queries for 30 seconds
      }
    });

  } catch (error) {
    console.error('Product match API error:', error);
    
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