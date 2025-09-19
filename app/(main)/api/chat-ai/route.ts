import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getAIInstructions } from '@/lib/instructions';
import { buildConversationContext, isFollowUpQuery } from '@/lib/context/conversation';
import { TermExtractor } from '@/lib/search/term-extractor';
import { assessSoftInference } from '@/lib/ai/assessor';
import type { OfferCandidate } from '@/lib/offers/resolver';
import { 
  verifySiteToken,
  getRequestOrigin,
  isWidgetRequestAllowed,
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type SiteToken,
} from '@/lib/widget-auth';
// Import for context handling

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Helper: dedupe array and cap to max items
function dedupeAndCap(arr: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of arr) {
    const k = (t || '').trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= cap) break;
  }
  return out;
}

// Helper: derive language-agnostic subject terms from recent user turns
function deriveSubjectTerms(messages: any[], maxTerms: number): string[] {
  try {
    const extractor = new TermExtractor();
    const userTexts: string[] = [];
    // Look back over last 3 user messages for salient terms
    let count = 0;
    for (let i = messages.length - 2; i >= 0 && count < 3; i--) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'user' || m.type === 'user') {
        const text = typeof m.content === 'string'
          ? m.content as string
          : (m.parts?.find((p: any) => p.type === 'text')?.text || '');
        if (text) {
          userTexts.push(text);
          count++;
        }
      }
    }
    const terms: string[] = [];
    for (const t of userTexts) {
      const ex = extractor.extractTerms(t, maxTerms);
      if (!ex) continue;
      // Prefer bigrams and code-like tokens (with digits)
      const prioritized = ex.combined.filter((tok) => tok.includes(' ') || /\d/.test(tok));
      terms.push(...prioritized);
    }
    return dedupeAndCap(terms, maxTerms);
  } catch {
    return [];
  }
}

// Helper: extract code-like tokens (brand codes/models) from text
function extractCodeLikeTokens(text: string): string[] {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .match(/\b[\p{L}]+\d+[\p{L}\d]*\b/gu) || [];
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

// Helper: language-agnostic comparative intent
function isComparativeQueryGeneric(query: string, subjectTerms: string[]): boolean {
  const q = (query || '').toLowerCase();
  if (!q) return false;
  // Indicators: two code-like tokens, explicit "vs" or slash, or contains min/max patterns
  const codes = extractCodeLikeTokens(q);
  if (codes.length >= 2) return true;
  if (q.includes(' vs ') || q.includes('vs.') || q.includes('/')) return true;
  // Generic comparatives: contains superlative/comparative markers and a subject exists
  const hasSubject = subjectTerms && subjectTerms.length > 0;
  const compHints = ['<', '>', '='];
  if (hasSubject && compHints.some(h => q.includes(h))) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const DEBUG = process.env.DEBUG_CHAT_AI === 'true' || process.env.NODE_ENV === 'development';
    const secureMode = process.env.SECURE_CHAT_AI_ENABLED === 'true';
    const DEBUG_AUTH = process.env.DEBUG_CHAT_AI === 'true';
    const origin = getRequestOrigin(request);
    let allowedOriginsForCors: string[] = [];

    // Parse the request body - AI SDK sends { messages: UIMessage[], siteId: string }
    const body = await request.json();
    const { messages, siteId, introMessage, pageContext, widgetToken } = body;
    
    if (!siteId || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and messages' }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCORSHeaders(origin, allowedOriginsForCors),
          }
        }
      );
    }
    
    const { userId } = await auth();

    // SECURITY: Optional JWT/origin enforcement for widget traffic
    if (secureMode) {
      const authHeader = request.headers.get('authorization');
      if (DEBUG_AUTH) {
        console.log('[CHAT-AI AUTH] incoming', {
          hasAuthHeader: !!(authHeader && authHeader.startsWith('Bearer ')),
          hasWidgetToken: typeof widgetToken === 'string' && widgetToken.length > 10,
          origin,
          referer: request.headers.get('referer') || null,
        });
      }
      let token: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (widgetToken && typeof widgetToken === 'string') {
        // Fallback: accept token in body to avoid client header issues
        token = widgetToken;
      }
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Bearer token required' }),
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }
      const decoded: SiteToken | null = verifySiteToken(token);
      if (!decoded) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          { status: 401, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      // Verify token origin match
      if (!origin || origin !== decoded.origin) {
        return new Response(
          JSON.stringify({ error: 'Origin mismatch' }),
          { status: 403, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      // Initialize Supabase (service role for server-side checks)
      const supabaseForPolicy = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Validate site and fetch allowed origins
      const { data: siteRow, error: siteErr } = await supabaseForPolicy
        .from('sites')
        .select('id, allowed_origins, widget_enabled')
        .eq('id', siteId)
        .eq('widget_enabled', true)
        .single();

      if (siteErr || !siteRow) {
        return new Response(
          JSON.stringify({ error: 'Site not found or widget disabled' }),
          { status: 404, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      // Parse allowed origins defensively
      if (Array.isArray(siteRow.allowed_origins)) {
        allowedOriginsForCors = siteRow.allowed_origins as string[];
      } else if (typeof siteRow.allowed_origins === 'string') {
        try {
          const parsed = JSON.parse(siteRow.allowed_origins);
          allowedOriginsForCors = Array.isArray(parsed) ? parsed : [];
        } catch {
          allowedOriginsForCors = [];
        }
      }

      // Validate widget request using parentOrigin contained in token
      const validation = isWidgetRequestAllowed(origin, decoded.parentOrigin || null, allowedOriginsForCors);
      if (!validation.allowed) {
        return new Response(
          JSON.stringify({ error: validation.reason || 'Origin not allowed' }),
          { status: 403, headers: getCORSHeaders(origin, allowedOriginsForCors) }
        );
      }

      // Rate limiting (per-site per-IP), skip for localhost
      const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
      const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
      const rateKey = getRateLimitKey(`chat:${siteId}`, clientIP);
      if (!isLocalhost && !(await rateLimiter.isAllowed(rateKey, 60, 60_000))) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...getCORSHeaders(origin, allowedOriginsForCors), 'Retry-After': '60' } }
        );
      }
    }
    
    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Use vector search to get relevant context
    const { VectorSearchService } = await import('@/lib/embeddings/search');
    const searchService = new VectorSearchService();
    
    // Note: Conversation history removed to prevent query contamination
    // Direct search ensures consistent, predictable results
    
    // Get the current user message
    const currentQuery = messages[messages.length - 1]?.content || 
      messages[messages.length - 1]?.parts?.find((p: any) => p.type === 'text')?.text || '';
    
    // STEP 1: Resolve offer hint (stateless, UI only) - flag-gated until RPC is deployed
    const { filterChunksByOffer, logFilterResult } = await import('@/lib/offers/chunk-filter');
    let offerHint: any = { type: 'none' as const, query_norm: '' };
    if (process.env.OFFER_RESOLVER_ENABLED !== 'false') {
      try {
        const { resolveOfferHint } = await import('@/lib/offers/resolver');
        offerHint = await resolveOfferHint(currentQuery, siteId);
        if (process.env.DEBUG_CHAT_AI === 'true' || process.env.NODE_ENV === 'development') {
          console.log('[DEBUG] Offer resolution:', {
            query: currentQuery.substring(0, 50),
            decision: offerHint.type,
            winner: offerHint.offer?.title || 'none',
            queryNorm: offerHint.query_norm
          });
        }
      } catch (error) {
        console.error('[ERROR] Offer resolution failed (resolver disabled or RPC missing):', error);
        offerHint = { type: 'none' as const, query_norm: '' };
      }
    }
    
    // Build conversation-aware context (optional) and anchor with offer data
    const convoAware = process.env.CONVERSATION_AWARE_SEARCH !== 'false';
    let conversationContext: string[] = [];
    if (convoAware) {
      conversationContext = buildConversationContext(
        messages,
        { lastTurns: Number(process.env.CONTEXT_LAST_TURNS ?? 2), maxTerms: Number(process.env.CONTEXT_MAX_TERMS ?? 5) }
      );
      // Merge language-agnostic subject terms derived from recent user messages
      const subjectExtra = deriveSubjectTerms(messages, Number(process.env.CONTEXT_MAX_TERMS ?? 5));
      if (subjectExtra.length) {
        conversationContext = dedupeAndCap(
          [...conversationContext, ...subjectExtra],
          Number(process.env.CONTEXT_MAX_TERMS ?? 5)
        );
      }
    }
    // Lightweight page context terms (title only, small cap)
    if (convoAware && pageContext?.title) {
      try {
        const extractor = new TermExtractor();
        const extracted = extractor.extractTerms(pageContext.title, 3);
        if (extracted) {
          conversationContext = [...conversationContext, ...extracted.combined.slice(0, 3)];
        }
      } catch {}
    }
    if (convoAware && offerHint?.type === 'single' && offerHint.offer) {
      // Lightly bias retrieval with anchored terms (no hard filtering)
      const extra: string[] = [];
      if (offerHint.offer.brand_norm) extra.push(offerHint.offer.brand_norm);
      if (offerHint.offer.model_norm) extra.push(offerHint.offer.model_norm);
      if (offerHint.offer.title) extra.push(offerHint.offer.title);
      conversationContext = dedupeAndCap([...conversationContext, ...extra], Number(process.env.CONTEXT_MAX_TERMS ?? 5));
    }
    // If multiple candidates, bias by majority brand across alternatives
    if (convoAware && offerHint?.type === 'multiple' && offerHint.alternatives?.length) {
      const alts: OfferCandidate[] = (offerHint.alternatives as OfferCandidate[]) ?? [];
      const brandCounts = new Map<string, number>();
      for (const a of alts) {
        if (a.brand_norm) brandCounts.set(a.brand_norm, (brandCounts.get(a.brand_norm) || 0) + 1);
      }
      let majorityBrand: string | undefined;
      let max = 0;
      for (const [b, c] of brandCounts.entries()) {
        if (c > max) { max = c; majorityBrand = b; }
      }
      if (majorityBrand && max > 1) {
        // Bias by brand and first two models of that brand
        const models = alts
          .filter((a: OfferCandidate) => a.brand_norm === majorityBrand && !!a.model_norm)
          .slice(0, 2)
          .map((a: OfferCandidate) => a.model_norm!) as string[];
        conversationContext = dedupeAndCap([...conversationContext, majorityBrand, ...models], Number(process.env.CONTEXT_MAX_TERMS ?? 5));
      }
    }

    // STEP 2: Perform retrieval
    let searchResults: any[] = [];
    let vectorResults: any[] = [];
    let queryEmbeddingDebug: number[] = [];
    let topVectorScore = 0;
    let topHybridScore = 0;
    let useCleanRefusal = false;
    let filterUsed = false;
    let searchTelemetry: any = null;
    const followUp = isFollowUpQuery(currentQuery);
    try {
      const startTime = Date.now();
      
      // Debug: Generate and log the query embedding with normalization info
      const { EmbeddingProviderFactory } = await import('@/lib/embeddings/factory');
      const embeddingProvider = EmbeddingProviderFactory.fromEnvironment();
      
      // Get normalization debug info
      const debugInfo = embeddingProvider.getDebugInfo ? 
        embeddingProvider.getDebugInfo(currentQuery) : 
        { 
          original: currentQuery, 
          normalized: currentQuery, 
          hash: 'no-hash', 
          changed: false 
        };
      
      queryEmbeddingDebug = await embeddingProvider.generateEmbedding(currentQuery);
      if (DEBUG) {
        console.log('[DEBUG] Query embedding generated:', {
          originalQuery: debugInfo.original,
          normalizedQuery: debugInfo.normalized,
          textHash: debugInfo.hash,
          wasNormalized: debugInfo.changed,
          embeddingLength: queryEmbeddingDebug.length,
          firstFewValues: queryEmbeddingDebug.slice(0, 5).map(v => v.toFixed(6)),
          embeddingSum: queryEmbeddingDebug.reduce((a, b) => a + b, 0).toFixed(6)
        });
      }
      
      // Check if corpus-aware search is enabled
      const corpusAwareEnabled = process.env.CORPUS_AWARE_SEARCH === 'true';
      
      if (convoAware) {
        const isShort = (currentQuery || '').trim().split(/\s+/).filter(Boolean).length <= 3;
        // Conversation-aware boosting without mutating the query
        const smart = await searchService.searchWithSmartContext(
          currentQuery,
          siteId,
          { terms: conversationContext },
          {
            vectorWeight: 0.6,
            limit: 10,
            useReranker: false,
            similarityThreshold: isShort
              ? Math.min(0.15, Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.3))
              : Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.3),
          }
        );
        searchResults = smart as any[];
        // Use boosted score when available (final_score), else fallback to similarity
        {
          const top: any = searchResults[0] || {};
          topHybridScore = typeof top.final_score === 'number'
            ? top.final_score
            : (top.similarity ?? 0);
        }
        // Compute vector for routing
        const { EmbeddingProviderFactory } = await import('@/lib/embeddings/factory');
        const embeddingProvider2 = EmbeddingProviderFactory.fromEnvironment();
        const emb = await embeddingProvider2.generateEmbedding(currentQuery);
        vectorResults = await searchService.vectorSearch(emb, siteId, 10);
        topVectorScore = vectorResults[0]?.similarity ?? 0;
        // Merge ephemeral page-context chunks if available
        if (process.env.ENABLE_PAGE_CONTEXT !== 'false' && pageContext?.url) {
          try {
            const h = (await import('crypto')).createHash('sha1').update(pageContext.url).digest('hex').slice(0, 16);
            const ck = `pagectx:${siteId}:${h}`;
            const cached = await (await import('@/lib/cache')).cache.get<any>(ck);
            if (cached?.chunks?.length) {
              const { cosineSimilarity } = await import('ai');
              const pageChunks = cached.chunks
                .map((pc: any, idx: number) => ({
                  chunkId: `ephemeral:${h}:${idx}`,
                  content: pc.content,
                  materialTitle: cached.title || 'Page',
                  similarity: cosineSimilarity(emb, pc.embedding) || 0,
                  metadata: { source: 'page' }
                }))
                .sort((a: any, b: any) => b.similarity - a.similarity)
                .slice(0, Number(process.env.PAGE_CONTEXT_MAX_CHUNKS ?? 2));
              searchResults = [...pageChunks, ...searchResults].slice(0, 10);
              {
                const top: any = searchResults[0] || {};
                topHybridScore = typeof top.final_score === 'number'
                  ? top.final_score
                  : (top.similarity ?? topHybridScore);
              }
            }
          } catch (e) {
            if (DEBUG) console.warn('[PageContext] merge error', e);
          }
        }
      } else if (corpusAwareEnabled) {
        // Use enhanced search with term extraction
        const enhancedResult = await searchService.hybridSearchWithTermExtraction(
          currentQuery,
          siteId,
          {
            vectorWeight: 0.6,
            limit: 10,
            useReranker: false,
            similarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.3),
          }
        );
        
        searchResults = enhancedResult.results;
        searchTelemetry = enhancedResult.telemetry;
        
        // Extract scores from search results and telemetry (prefer boosted final_score)
        {
          const top: any = searchResults[0] || {};
          topHybridScore = typeof top.final_score === 'number'
            ? top.final_score
            : (top.similarity ?? 0);
        }
        // Compute vector score separately for routing
        const { EmbeddingProviderFactory } = await import('@/lib/embeddings/factory');
        const embeddingProvider2 = EmbeddingProviderFactory.fromEnvironment();
        const emb = await embeddingProvider2.generateEmbedding(currentQuery);
        vectorResults = await searchService.vectorSearch(emb, siteId, 10);
        topVectorScore = vectorResults[0]?.similarity ?? 0;
        
        if (DEBUG) console.log('[DEBUG] Enhanced Search Telemetry:', searchTelemetry);
      } else {
        // Use original search logic
        const [vectorSearchResults, hybridResults] = await Promise.all([
          searchService.vectorSearch(
            queryEmbeddingDebug,
            siteId,
            10
          ),
          searchService.hybridSearch(
            currentQuery,
            siteId,
            {
              vectorWeight: 0.6,
              limit: 10,
              useReranker: false,
              similarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.3),
            }
          )
        ]);
        
        searchResults = hybridResults;
        vectorResults = vectorSearchResults;
        topVectorScore = vectorResults[0]?.similarity ?? 0;
        {
          const top: any = searchResults[0] || {};
          topHybridScore = typeof top.final_score === 'number'
            ? top.final_score
            : (top.similarity ?? 0);
        }
        // Merge ephemeral page-context chunks if available
        if (process.env.ENABLE_PAGE_CONTEXT !== 'false' && pageContext?.url) {
          try {
            const h = (await import('crypto')).createHash('sha1').update(pageContext.url).digest('hex').slice(0, 16);
            const ck = `pagectx:${siteId}:${h}`;
            const cached = await (await import('@/lib/cache')).cache.get<any>(ck);
            if (cached?.chunks?.length) {
              const { cosineSimilarity } = await import('ai');
              const pageChunks = cached.chunks
                .map((pc: any, idx: number) => ({
                  chunkId: `ephemeral:${h}:${idx}`,
                  content: pc.content,
                  materialTitle: cached.title || 'Page',
                  similarity: cosineSimilarity(queryEmbeddingDebug, pc.embedding) || 0,
                  metadata: { source: 'page' }
                }))
                .sort((a: any, b: any) => b.similarity - a.similarity)
                .slice(0, Number(process.env.PAGE_CONTEXT_MAX_CHUNKS ?? 2));
              searchResults = [...pageChunks, ...searchResults].slice(0, 10);
              {
                const top: any = searchResults[0] || {};
                topHybridScore = typeof top.final_score === 'number'
                  ? top.final_score
                  : (top.similarity ?? topHybridScore);
              }
            }
          } catch (e) {
            if (DEBUG) console.warn('[PageContext] merge error', e);
          }
        }
      }
      const searchTime = Date.now() - startTime;
      
      // STEP 3: Apply post-filter to prevent G3/G4 mixing (KEY!)
      if (offerHint.type === 'single' && offerHint.offer) {
        const originalChunkCount = searchResults.length;
        const filterResult = filterChunksByOffer(searchResults, {
          brand_norm: offerHint.offer.brand_norm,
          model_norm: offerHint.offer.model_norm
        });
        
        searchResults = filterResult.filtered;
        filterUsed = true;
        
        // Log filter results for debugging
        logFilterResult(currentQuery, offerHint.offer, filterResult);
        
        console.log('[DEBUG] Post-filter applied:', {
          winner: offerHint.offer.title,
          brand_norm: offerHint.offer.brand_norm,
          model_norm: offerHint.offer.model_norm,
          originalChunks: originalChunkCount,
          filteredChunks: searchResults.length,
          method: filterResult.method,
          fallback: filterResult.fallback
        });
        
        // If no chunks survive filtering, prepare for clean refusal
        if (searchResults.length === 0) {
          useCleanRefusal = true;
          console.log('[DEBUG] Post-filter eliminated all chunks - clean refusal');
        }
      }
      
      if (DEBUG) console.log('[DEBUG] Hybrid search completed:', {
        originalQuery: debugInfo.original.substring(0, 50),
        normalizedQuery: debugInfo.normalized.substring(0, 50),
        textHash: debugInfo.hash,
        searchTimeMs: searchTime,
        vectorResults: vectorResults.length,
        hybridResults: searchResults.length,
        topVectorScore: topVectorScore.toFixed(3),
        topHybridScore: topHybridScore.toFixed(3),
        vectorBoostedHybrid: topHybridScore > topVectorScore,
        firstChunkTitle: searchResults[0]?.materialTitle || 'none',
        siteId,
        success: true,
        embeddingSum: queryEmbeddingDebug.reduce((a, b) => a + b, 0).toFixed(6)
      });
    } catch (error) {
      console.error('[ERROR] Vector search failed:', {
        originalQuery: currentQuery.substring(0, 50),
        error: error instanceof Error ? error.message : String(error),
        siteId,
        stack: error instanceof Error ? error.stack : undefined
      });
      searchResults = []; // Fallback to empty results
    }
    
    // Composite routing: vectors dominate recall; FTS supports
    const topSimilarity = (() => {
      const top: any = searchResults[0] || {};
      return typeof top.final_score === 'number' ? top.final_score : (top.similarity ?? 0);
    })();
    const maxChunks = Number(process.env.RAG_MAX_CHUNKS ?? 6);

    const vectorMin = Number(process.env.VECTOR_CONFIDENCE_MIN ?? 0.4);
    const keywordMin = Number(process.env.KEYWORD_CONFIDENCE_MIN ?? 0.03);
    const vectorOverride = Number(process.env.VECTOR_OVERRIDE_THRESHOLD ?? 0.4);

    const ftsSilent = topSimilarity === 0;
    // Enhanced follow-up detection: treat as follow-up if short OR no new code-like tokens and subject exists
    const subjectCodes = extractCodeLikeTokens((conversationContext || []).join(' '));
    const currentCodes = extractCodeLikeTokens(currentQuery);
    const shortQuery = (currentQuery || '').trim().split(/\s+/).filter(Boolean).length <= 3;
    const noNewCodes = subjectCodes.length > 0 && currentCodes.every(c => subjectCodes.includes(c.toLowerCase()));
    const effectiveFollowUp = shortQuery || noNewCodes || isFollowUpQuery(currentQuery);

    const followVectorMin = Number(process.env.FOLLOWUP_VECTOR_CONFIDENCE_MIN ?? vectorMin);
    const usedVectorMin = effectiveFollowUp ? Math.min(followVectorMin, vectorMin) : vectorMin;

    const vectorStrong = topVectorScore >= usedVectorMin || (ftsSilent && topVectorScore >= vectorOverride);
    const keywordStrong = topSimilarity >= keywordMin;

    const hasRelevantMaterials = !useCleanRefusal && (vectorStrong || keywordStrong);

    // Enhanced telemetry for monitoring and debugging
    const routeDecision = {
      query: currentQuery.substring(0, 50),
      topVectorScore: topVectorScore.toFixed(3),
      topHybridScore: topSimilarity.toFixed(3),
      vectorMin,
      keywordMin,
      vectorOverride,
      vectorStrong,
      keywordStrong,
      resultsFound: searchResults.length,
      route: hasRelevantMaterials ? 'answer' : 'refuse',
      // Offer system telemetry
      offerDecision: offerHint.type,
      offerWinner: offerHint.offer?.title || null,
      postFilterUsed: filterUsed,
      cleanRefusalTriggered: useCleanRefusal,
      // Enhanced search telemetry
      corpusAwareEnabled: process.env.CORPUS_AWARE_SEARCH === 'true',
      ...(searchTelemetry && {
        extractionMethod: searchTelemetry.extraction_method,
        extractedTermsCount: searchTelemetry.extracted_terms_raw.length,
        validatedTermsCount: searchTelemetry.validated_terms_kept.length,
        keywordPathRan: searchTelemetry.keyword_path_ran,
        trigramFallback: searchTelemetry.trigram_fallback_used,
        ftsQueryBuilt: searchTelemetry.fts_query_built
      }),
      siteId,
      timestamp: new Date().toISOString()
    };
    
    if (DEBUG) console.log('[Chat AI] Route Decision:', routeDecision);

    // Debug routing logic
    if (DEBUG) console.log('[DEBUG] Routing Logic:', {
      hasRelevantMaterials,
      vectorStrong: `${topVectorScore.toFixed(3)} >= ${vectorMin} || (ftsSilent:${ftsSilent} && >= ${vectorOverride}) = ${vectorStrong}`,
      keywordStrong: `${topSimilarity.toFixed(3)} >= ${keywordMin} = ${keywordStrong}`,
      decision: `${vectorStrong} || ${keywordStrong} = ${hasRelevantMaterials}`
    });

    // Comparative clarifier: if comparative intent but evidence for both sides is weak, ask one concise clarifier
    const subjectTermsForComp = (conversationContext || []).filter(t => /\d/.test(t));
    const comparativeWanted = isComparativeQueryGeneric(currentQuery, subjectTermsForComp);
    if (comparativeWanted) {
      const codesQ = extractCodeLikeTokens(currentQuery);
      const codesSubject = extractCodeLikeTokens(subjectTermsForComp.join(' '));
      const codesSet = Array.from(new Set([...codesQ, ...codesSubject]));
      const pick = codesSet.slice(0, 2);

      // Check if retrieved chunks mention both sides
      let hasA = false, hasB = false;
      if (pick.length === 2) {
        const [a, b] = pick.map(s => s.toLowerCase());
        for (const r of searchResults) {
          const c = (r.content || '').toLowerCase();
          if (c.includes(a)) hasA = true;
          if (c.includes(b)) hasB = true;
          if (hasA && hasB) break;
        }
      }

      if (pick.length < 2 || !(hasA && hasB)) {
        const userMessage = messages[messages.length - 1];
        const clarifierMessages = [
          { role: 'system' as const, content: 'Ask exactly one short clarifying question in the user\'s language. Be natural; do not mention sources.' },
          { role: 'user' as const, content: typeof userMessage.content === 'string' ? (userMessage.content as string) : (userMessage.parts?.find((p: any) => p.type === 'text')?.text || '') }
        ];
        const result = streamText({ model: openai('gpt-4o-mini'), messages: clarifierMessages, temperature: 0, maxOutputTokens: 60 });
        const response = result.toUIMessageStreamResponse();
        if (secureMode) {
          const cors = getCORSHeaders(origin, allowedOriginsForCors);
          for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
        }
        response.headers.set('X-Route-Mode', 'clarify');
        return response;
      }
    }

    // Store search results for product recommendation (only if relevant) - for future integration
    // const retrievedChunks = hasRelevantMaterials 
    //   ? searchResults.slice(0, maxChunks).map(r => ({
    //       content: r.content,
    //       materialTitle: r.materialTitle
    //     }))
    //   : [];
    
    // Get AI instructions from centralized location
    const baseInstructions = getAIInstructions();
    // Detect user's language to enforce reply language (best-effort), with site TLD fallback for short queries
    let languageInstruction = '';
    try {
      const tinyld = await import('tinyld');
      const lastText = (typeof messages[messages.length - 1]?.content === 'string')
        ? (messages[messages.length - 1]?.content as string)
        : (messages[messages.length - 1]?.parts?.find((p: any) => p.type === 'text')?.text || '');
      const code = tinyld.detect(lastText || '');
      const LANG_NAME: Record<string, string> = {
        en: 'English',
        no: 'Norwegian', nb: 'Norwegian', nn: 'Norwegian',
        da: 'Danish', sv: 'Swedish', fi: 'Finnish',
        de: 'German', fr: 'French', es: 'Spanish', pt: 'Portuguese', it: 'Italian', nl: 'Dutch'
      };
      const name = LANG_NAME[code as string];
      // Site-based fallback via TLD heuristics
      const inferFromUrl = (u?: string | null): string | undefined => {
        if (!u) return undefined;
        try {
          const host = new URL(u).hostname.toLowerCase();
          if (host.endsWith('.no')) return 'Norwegian';
          if (host.endsWith('.se')) return 'Swedish';
          if (host.endsWith('.dk')) return 'Danish';
          if (host.endsWith('.fi')) return 'Finnish';
          if (host.endsWith('.de')) return 'German';
          if (host.endsWith('.nl')) return 'Dutch';
          if (host.endsWith('.fr')) return 'French';
          if (host.endsWith('.es')) return 'Spanish';
          if (host.endsWith('.pt')) return 'Portuguese';
          if (host.endsWith('.it')) return 'Italian';
          return undefined;
        } catch { return undefined; }
      };
      // Prefer pageContext URL if available; otherwise rely on request origin (iframe) which is app domain
      const siteLang = inferFromUrl((pageContext && pageContext.url) ? pageContext.url : undefined);
      const shortOrAmbiguous = !lastText || lastText.trim().length < 12;
      const finalName = (shortOrAmbiguous && siteLang) ? siteLang : (name || siteLang);
      if (finalName) languageInstruction = `\n\nIMPORTANT: Respond in ${finalName}.`;
    } catch {}
    
    // Add intro message context if provided - use strong instruction language
    const introContext = introMessage 
      ? `\n\nIMPORTANT: You initially greeted the user with: "${introMessage}". Keep this context in mind and maintain consistency with your previous behavior in this conversation.\n`
      : '';

    // Use vector results as fallback when hybrid search fails but vector succeeds
    const chunksToUse = searchResults.length > 0 ? searchResults : vectorResults;
    
    if (!hasRelevantMaterials) {
      // REFUSE MODE: Ultra-constrained generation
      if (DEBUG) console.log('[Chat AI] Refuse mode - constrained generation', {
        query: currentQuery.substring(0, 50),
        topSimilarity: topSimilarity.toFixed(3),
        siteId,
      });

      // Soft-inference gate: only when enabled and signal is decent
      const softEnabled = process.env.ENABLE_SOFT_INFERENCE !== 'false';
      const vectorFloor = Number(process.env.SOFT_INFERENCE_VECTOR_FLOOR ?? 0.25);
      const maxSoftChunks = Number(process.env.SOFT_INFERENCE_MAX_CHUNKS ?? 3);
      const canSoftInfer = softEnabled && (topVectorScore >= vectorFloor || offerHint.type === 'single');

      if (canSoftInfer) {
        try {
          // Prepare small chunk excerpts for assessor (non-sensitive)
          const assessChunks = chunksToUse
            .slice(0, maxSoftChunks)
            .map(c => ({
              title: c.materialTitle || 'Untitled',
              excerpt: c.content.length > 160 ? c.content.slice(0, 160) + '…' : c.content
            }));
          const anchor = offerHint.type === 'single' && offerHint.offer
            ? { brand: offerHint.offer.brand, model: offerHint.offer.model, title: offerHint.offer.title }
            : null;

          const lastUser = messages[messages.length - 1];
          const lastText = typeof lastUser.content === 'string'
            ? (lastUser.content as string)
            : (lastUser.parts?.find((p: any) => p.type === 'text')?.text || '');

          const assess = await assessSoftInference({
            query: lastText,
            contextTerms: conversationContext || [],
            offerAnchor: anchor,
            chunks: assessChunks
          });

          if (DEBUG) console.log('[SoftInference] Assessor:', assess);

          if (assess.safe_inference && (assess.confidence === 'high' || assess.confidence === 'medium')) {
            // Stream a qualified, cautious answer in user's language (no invented specifics)
            const cautiousSystem = 'Respond in the user\'s language. You do not have explicit information about the exact case; give a brief, cautious answer based on general applicability described. Do not invent specific facts or numbers. Use a qualifier like "based on what is described" and suggest following normal safety/usage guidance.';
            const userMessage = messages[messages.length - 1];
            const cautiousMessages = [
              { role: 'system' as const, content: cautiousSystem },
              { role: 'user' as const, content: typeof userMessage.content === 'string' ? userMessage.content : (userMessage.parts?.find((p: any) => p.type === 'text')?.text || '') }
            ];
            const result = streamText({ model: openai('gpt-4o-mini'), messages: cautiousMessages, temperature: 0.2, maxOutputTokens: 120 });
            const response = result.toUIMessageStreamResponse();
            if (secureMode) {
              const cors = getCORSHeaders(origin, allowedOriginsForCors);
              for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
            }
            response.headers.set('X-Route-Mode', 'soft-inference');
            return response;
          }
        } catch (e) {
          if (DEBUG) console.warn('[SoftInference] error', e);
        }
      }

      // Clarify if we eliminated chunks but have a clear offer winner
      if (useCleanRefusal && offerHint.type === 'single' && offerHint.offer) {
        const userMessage = messages[messages.length - 1];
        const clarifierMessages = [
          { role: 'system' as const, content: 'Ask exactly one short clarifying question in the user\'s language. Be natural and avoid mentioning sources.' },
          { role: 'user' as const, content: `Follow-up about ${offerHint.offer.title}. ` + (typeof userMessage.content === 'string' ? userMessage.content : (userMessage.parts?.find((p: any) => p.type === 'text')?.text || '')) }
        ];
        const result = streamText({ model: openai('gpt-4o-mini'), messages: clarifierMessages, temperature: 0, maxOutputTokens: 60 });
        const response = result.toUIMessageStreamResponse();
        if (secureMode) {
          const cors = getCORSHeaders(origin, allowedOriginsForCors);
          for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
        }
        response.headers.set('X-Route-Mode', 'clarify');
        response.headers.set('X-Offer-Title', offerHint.offer.title);
        return response;
      }

      // Extract just the current user message for context
      const userMessage = messages[messages.length - 1];
      
      // Create minimal message set with strict refusal instruction
      const refusalMessages = [
        {
          role: 'system' as const,
          content: 'Respond in the user\'s language with a brief message that you don\'t have information about that topic. Be natural and do not mention sources.'
        },
        {
          role: 'user' as const,
          content: typeof userMessage.content === 'string' 
            ? userMessage.content 
            : userMessage.parts?.find((p: { type: string; text: string }) => p.type === 'text')?.text || ''
        }
      ];

      // Stream with maximum constraints
      const result = streamText({
        model: openai('gpt-4o-mini'),
        messages: refusalMessages,
        temperature: 0,          // Completely deterministic
        maxOutputTokens: 50,     // Just enough for the refusal message
      });

      // Add telemetry headers for monitoring
      const response = result.toUIMessageStreamResponse();
      // Add CORS headers if secure mode validated origin
      if (secureMode) {
        const cors = getCORSHeaders(origin, allowedOriginsForCors);
        for (const [k, v] of Object.entries(cors)) {
          response.headers.set(k, v);
        }
      }
      response.headers.set('X-Route-Mode', 'refuse');
      response.headers.set('X-Top-Similarity', topSimilarity.toString());
      
      // Add offer hint info to refusal for debugging
      if (useCleanRefusal) {
        response.headers.set('X-Refusal-Reason', 'post-filter-elimination');
        response.headers.set('X-Offer-Winner', offerHint.offer?.title || '');
      } else {
        response.headers.set('X-Refusal-Reason', 'low-similarity');
      }
      
      return response;
    }

    // ANSWER MODE: Include training materials
    if (DEBUG) console.log('[Chat AI] Answer mode - including training materials', {
      query: currentQuery.substring(0, 50),
      chunksIncluded: chunksToUse.slice(0, maxChunks).length,
      usingVectorFallback: searchResults.length === 0 && vectorResults.length > 0,
      siteId,
    });
    
    // Debug: Show what chunks are actually being retrieved
    if (DEBUG) {
      console.log('[DEBUG] Retrieved chunks:');
      chunksToUse.slice(0, maxChunks).forEach((chunk, i) => {
        console.log(`  ${i + 1}. [${chunk.similarity?.toFixed(3)}] ${chunk.materialTitle}`);
      });
    }
    
    const relevantChunks = chunksToUse
      .slice(0, maxChunks)
      .map(r => `[Source: ${r.materialTitle}]\n${r.content}`)
      .join('\n\n---\n\n');
      
    const fullSystemPrompt = `${baseInstructions}${languageInstruction}${introContext}\n\nRelevant Training Materials:\n${relevantChunks}`;
    
    // Debug: prompt length only
    if (DEBUG) console.log('[DEBUG] System prompt sent (length):', fullSystemPrompt.length);
    
    // Convert UI messages to model messages - no manipulation needed
    const modelMessages = [
      { role: 'system' as const, content: fullSystemPrompt },
      ...convertToModelMessages(messages)
    ];
    
    // Stream the response using AI SDK with offer metadata
    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: modelMessages,
      temperature: 0.7,
      maxOutputTokens: 1000,
    });

    // Return the UI message stream response with offer hint metadata
    const response = result.toUIMessageStreamResponse();
    // Add CORS headers if secure mode validated origin
    if (secureMode) {
      const cors = getCORSHeaders(origin, allowedOriginsForCors);
      for (const [k, v] of Object.entries(cors)) {
        response.headers.set(k, v);
      }
    }
    
    // Add offer hint headers for UI consumption
    if (offerHint.type === 'single' && offerHint.offer) {
      response.headers.set('X-Offer-Type', offerHint.type);
      response.headers.set('X-Offer-Title', offerHint.offer.title);
      response.headers.set('X-Offer-URL', offerHint.offer.url);
      if (filterUsed) {
        response.headers.set('X-Post-Filter-Applied', 'true');
      }
    } else if (offerHint.type === 'multiple') {
      response.headers.set('X-Offer-Type', offerHint.type);
      response.headers.set('X-Offer-Alternatives-Count', offerHint.alternatives?.length.toString() || '0');
    }
    
    return response;
    
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
