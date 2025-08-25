import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { getAIInstructions } from '@/lib/instructions';
// Import for context handling

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  
  try {
    // Parse the request body - AI SDK sends { messages: UIMessage[], siteId: string }
    const body = await request.json();
    const { messages, siteId, introMessage } = body;
    
    if (!siteId || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: siteId and messages' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { userId } = await auth();
    
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
    
    // STEP 1: Resolve offer hint (stateless, UI only)
    const { resolveOfferHint } = await import('@/lib/offers/resolver');
    const { filterChunksByOffer, logFilterResult } = await import('@/lib/offers/chunk-filter');
    
    let offerHint;
    try {
      offerHint = await resolveOfferHint(currentQuery, siteId);
      console.log('[DEBUG] Offer resolution:', {
        query: currentQuery.substring(0, 50),
        decision: offerHint.type,
        winner: offerHint.offer?.title || 'none',
        queryNorm: offerHint.query_norm
      });
    } catch (error) {
      console.error('[ERROR] Offer resolution failed:', error);
      offerHint = { type: 'none' as const, query_norm: '' };
    }
    
    // STEP 2: Perform hybrid search (unchanged, stateless)
    let searchResults: any[] = [];
    let vectorResults: any[] = [];
    let queryEmbeddingDebug: number[] = [];
    let topVectorScore = 0;
    let topHybridScore = 0;
    let useCleanRefusal = false;
    let filterUsed = false;
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
      console.log('[DEBUG] Query embedding generated:', {
        originalQuery: debugInfo.original,
        normalizedQuery: debugInfo.normalized,
        textHash: debugInfo.hash,
        wasNormalized: debugInfo.changed,
        embeddingLength: queryEmbeddingDebug.length,
        firstFewValues: queryEmbeddingDebug.slice(0, 5).map(v => v.toFixed(6)),
        embeddingSum: queryEmbeddingDebug.reduce((a, b) => a + b, 0).toFixed(6)
      });
      
      // Run both vector and keyword searches separately for better debugging
      const [vectorSearchResults, hybridResults] = await Promise.all([
        searchService.vectorSearch(
          await embeddingProvider.generateEmbedding(currentQuery),
          siteId,
          10
        ),
        searchService.hybridSearch(
          currentQuery, // Use clean query without context contamination
          siteId,
          {
            vectorWeight: 0.6, // Balance vector and keyword search
            limit: 10, // Get more chunks to work with
            useReranker: false, // Disable reranker for debugging (since no Cohere key)
            similarityThreshold: Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.3),
          }
        )
      ]);
      
      // Use hybrid results but track both scores
      searchResults = hybridResults;
      vectorResults = vectorSearchResults;
      topVectorScore = vectorResults[0]?.similarity ?? 0;
      topHybridScore = searchResults[0]?.similarity ?? 0;
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
      
      console.log('[DEBUG] Hybrid search completed:', {
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
    
    // Determine routing using smart veto system
    const topSimilarity = searchResults[0]?.similarity ?? 0;
    const maxChunks = Number(process.env.RAG_MAX_CHUNKS ?? 6);
    
    // Smart veto system: Vector suggests, keyword vetos nonsense
    const vectorSuggestThreshold = Number(process.env.VECTOR_SUGGEST_THRESHOLD ?? 0.22);
    const keywordVetoThreshold = Number(process.env.KEYWORD_VETO_THRESHOLD ?? 0.03);
    
    const vectorSuggests = topVectorScore > vectorSuggestThreshold;
    const keywordVetos = topSimilarity < keywordVetoThreshold;
    
    // Answer only if vector suggests AND keyword doesn't veto
    // BUT: if post-filter eliminated all chunks, force clean refusal
    const hasRelevantMaterials = vectorSuggests && !keywordVetos && !useCleanRefusal;

    // Telemetry for monitoring and debugging
    console.log('[Chat AI] Route Decision:', {
      query: currentQuery.substring(0, 50),
      topVectorScore: topVectorScore.toFixed(3),
      topHybridScore: topSimilarity.toFixed(3),
      vectorSuggestThreshold,
      keywordVetoThreshold,
      vectorSuggests,
      keywordVetos,
      resultsFound: searchResults.length,
      route: hasRelevantMaterials ? 'answer' : 'refuse',
      // Offer system telemetry
      offerDecision: offerHint.type,
      offerWinner: offerHint.offer?.title || null,
      postFilterUsed: filterUsed,
      cleanRefusalTriggered: useCleanRefusal,
      siteId,
      timestamp: new Date().toISOString()
    });

    // Debug the veto system logic
    console.log('[DEBUG] Veto System Logic:', {
      hasRelevantMaterials,
      vectorSuggests: `${topVectorScore.toFixed(3)} > ${vectorSuggestThreshold} = ${vectorSuggests}`,
      keywordVetos: `${topSimilarity.toFixed(3)} < ${keywordVetoThreshold} = ${keywordVetos}`,
      decision: `${vectorSuggests} && !${keywordVetos} = ${hasRelevantMaterials}`
    });

    // Store search results for product recommendation (only if relevant) - for future integration
    // const retrievedChunks = hasRelevantMaterials 
    //   ? searchResults.slice(0, maxChunks).map(r => ({
    //       content: r.content,
    //       materialTitle: r.materialTitle
    //     }))
    //   : [];
    
    // Get AI instructions from centralized location
    const baseInstructions = getAIInstructions();
    
    // Add intro message context if provided - use strong instruction language
    const introContext = introMessage 
      ? `\n\nIMPORTANT: You initially greeted the user with: "${introMessage}". Keep this context in mind and maintain consistency with your previous behavior in this conversation.\n`
      : '';

    // Use vector results as fallback when hybrid search fails but vector succeeds
    const chunksToUse = searchResults.length > 0 ? searchResults : vectorResults;
    
    if (!hasRelevantMaterials) {
      // REFUSE MODE: Ultra-constrained generation
      console.log('[Chat AI] Refuse mode - constrained generation', {
        query: currentQuery.substring(0, 50),
        topSimilarity: topSimilarity.toFixed(3),
        siteId,
      });

      // Extract just the current user message for context
      const userMessage = messages[messages.length - 1];
      
      // Create minimal message set with strict refusal instruction
      const refusalMessages = [
        {
          role: 'system' as const,
          content: 'You must respond in the same language as the user\'s question with a polite message that you don\'t have information about that topic. Keep it brief and natural. Examples: English: "I don\'t have specific information about that topic." Norwegian: "Jeg har ikke spesifikk informasjon om det temaet." Do not add explanations or mention training materials.'
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
    console.log('[Chat AI] Answer mode - including training materials', {
      query: currentQuery.substring(0, 50),
      chunksIncluded: chunksToUse.slice(0, maxChunks).length,
      usingVectorFallback: searchResults.length === 0 && vectorResults.length > 0,
      siteId,
    });
    
    // Debug: Show what chunks are actually being retrieved
    console.log('[DEBUG] Retrieved chunks:');
    chunksToUse.slice(0, maxChunks).forEach((chunk, i) => {
      console.log(`  ${i + 1}. [${chunk.similarity?.toFixed(3)}] ${chunk.materialTitle} - "${chunk.content.substring(0, 100)}..."`);
    });
    
    const relevantChunks = chunksToUse
      .slice(0, maxChunks)
      .map(r => `[Source: ${r.materialTitle}]\n${r.content}`)
      .join('\n\n---\n\n');
      
    const fullSystemPrompt = `${baseInstructions}${introContext}\n\nRelevant Training Materials:\n${relevantChunks}`;
    
    // Debug: Show the actual system prompt being sent to AI
    console.log('[DEBUG] System prompt being sent to AI (first 800 chars):', fullSystemPrompt.substring(0, 800) + '...');
    
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