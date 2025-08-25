/**
 * Universal Resolution Engine
 * Main controller that orchestrates the entire resolution process
 * Handles ambiguity detection, context extraction, multi-context decisions
 */

import { VectorSearchService } from '../embeddings/search';
import { extractContext } from '../context/safe-extract';
import { detectAmbiguity } from './ambiguity-detector';
import { getChunksForCandidate, applyPostFilter, getPostFilterType } from './chunk-retrieval';
import { logTelemetryNonBlocking, TelemetryTimer } from './telemetry';
import { normalize_text } from '../context/safe-extract';

export interface ResolutionContext {
  messages: string[];
  pageContext?: {
    title?: string;
    description?: string;
    url?: string;
  };
}

export interface ResolutionResult {
  mode: 'single' | 'multi' | 'refusal';
  systemPrompt: string;
  chunks?: Array<{
    content: string;
    source: string;
  }>;
  telemetryData?: any;
}

export interface Candidate {
  id: string;
  title: string;
  category?: string;
  brand?: string;
  model?: string;
  base_score: number;
  final_score: number;
  score_source: 'fts' | 'trgm';
  boosts_applied: {
    term_matches: string[];
    category_boost: number;
  };
  content: string;
}

/**
 * Main resolution engine - processes query through entire pipeline
 */
export async function resolveQuery(
  query: string,
  siteId: string,
  context: ResolutionContext,
  baseInstructions: string
): Promise<ResolutionResult> {
  const timer = new TelemetryTimer();
  
  try {
    // Check if smart context is enabled
    const smartContextEnabled = process.env.ENABLE_SMART_CONTEXT === 'true';
    if (!smartContextEnabled) {
      // Fallback to simple hybrid search
      return await fallbackToSimpleSearch(query, siteId, baseInstructions, timer);
    }

    // PHASE 1: Extract context (before search)
    const safeContext = extractContext({
      messages: context.messages,
      page: context.pageContext
    });

    // PHASE 2: Detect ambiguity
    const ambiguity = detectAmbiguity(query);

    // PHASE 3: Smart search with context
    timer.startSearch();
    const searchService = new VectorSearchService();
    const searchResults = await searchService.searchWithSmartContext(
      query,
      siteId,
      {
        terms: safeContext.terms,
        categoryHint: safeContext.categoryHint
      }
    );
    const searchLatency = timer.endSearch();

    // PHASE 4: Convert SearchResult to Candidate format
    const candidates: Candidate[] = searchResults.map(result => ({
      id: result.chunkId,
      title: result.materialTitle,
      category: result.metadata?.category,
      brand: result.metadata?.brand,
      model: result.metadata?.model,
      base_score: result.base_score,
      final_score: result.final_score,
      score_source: result.score_source,
      boosts_applied: result.boosts_applied,
      content: result.content
    }));

    // PHASE 5: Decision logic
    const decision = makeResolutionDecision(candidates, ambiguity);

    // PHASE 6: Execute decision
    let result: ResolutionResult;
    
    switch (decision.type) {
      case 'single':
        result = await handleSingleContext(decision.candidate!, siteId, baseInstructions);
        break;
      case 'multi':
        result = await handleMultiContext(decision.candidates!, siteId, baseInstructions);
        break;
      case 'refusal':
      default:
        result = handleRefusal(baseInstructions);
        break;
    }

    // PHASE 6: Log telemetry (non-blocking)
    logTelemetryNonBlocking({
      site_id: siteId,
      query,
      query_norm: normalize_text(query),
      extracted_terms: safeContext.terms,
      category_hint: safeContext.categoryHint,
      category_source: 'page', // Simplified for v1
      ambiguous: ambiguity.ambiguous,
      ambiguous_score: ambiguity.score,
      ambiguity_tokens: ambiguity.tokens,
      candidates: searchResults.map(r => ({
        id: r.chunkId,
        title: r.materialTitle,
        category: 'uncategorized', // TODO: Add category resolution
        base_score: r.base_score,
        final_score: r.final_score,
        score_source: r.score_source
      })),
      decision: result.mode,
      multi_context_used: result.mode === 'multi',
      multi_context_products: result.mode === 'multi' ? 
        decision.candidates?.map(c => c.title) : undefined,
      page_context_used: !!context.pageContext,
      latency_ms: timer.getTotalLatency(),
      search_latency_ms: searchLatency,
      boosts_applied: {
        terms: [], // TODO: Extract from search results
        category_boost: 0
      },
      max_total_boost_applied: 0.25, // Max possible
      multilingual_fallback: searchResults.some(r => r.score_source === 'trgm'),
      score_source: searchResults[0]?.score_source || 'fts'
    });

    return result;

  } catch (error) {
    console.error('Resolution engine error:', error);
    return handleRefusal(baseInstructions);
  }
}

/**
 * Make resolution decision based on search results and ambiguity
 */
function makeResolutionDecision(
  searchResults: Array<Candidate>,
  ambiguity: ReturnType<typeof detectAmbiguity>
): {
  type: 'single' | 'multi' | 'refusal';
  candidate?: Candidate;
  candidates?: Candidate[];
} {
  if (searchResults.length === 0) {
    return { type: 'refusal' };
  }

  const top = searchResults[0];
  const second = searchResults[1];

  // Require text signal (base_score > 0 means had FTS or alias match)
  if (top.base_score === 0) {
    return { type: 'refusal' };
  }

  // Check for multi-context conditions
  const AMBIGUITY_DELTA = parseFloat(process.env.AMBIGUITY_DELTA || '0.2');
  const MIN_AMBIGUITY_SCORE = parseFloat(process.env.AMBIGUITY_MIN_SCORE || '0.5');
  
  const delta = top.final_score - (second?.final_score || 0);
  const differentCategories = top.category !== second?.category;
  
  const shouldUseMultiContext = (
    ambiguity.score >= MIN_AMBIGUITY_SCORE &&  // High ambiguity
    delta <= AMBIGUITY_DELTA &&                // Close scores
    differentCategories &&                     // Different categories
    second                                      // Has second candidate
  );

  if (shouldUseMultiContext) {
    return {
      type: 'multi',
      candidates: [top, second]
    };
  }

  return {
    type: 'single',
    candidate: top
  };
}

/**
 * Handle single context resolution
 */
async function handleSingleContext(
  candidate: Candidate,
  siteId: string,
  baseInstructions: string
): Promise<ResolutionResult> {
  // Get chunks for the selected candidate
  const chunks = await getChunksForCandidate(
    {
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      brand: candidate.brand,
      model: candidate.model
    },
    siteId
  );

  if (chunks.length === 0) {
    return handleRefusal(baseInstructions);
  }

  const contextText = chunks
    .map(chunk => chunk.content)
    .join('\n\n---\n\n');

  return {
    mode: 'single',
    systemPrompt: `${baseInstructions}\n\nRelevant Training Materials:\n${contextText}`,
    chunks: chunks.map(chunk => ({
      content: chunk.content,
      source: chunk.materialTitle
    }))
  };
}

/**
 * Handle multi-context resolution
 */
async function handleMultiContext(
  candidates: Candidate[],
  siteId: string,
  baseInstructions: string
): Promise<ResolutionResult> {
  const MAX_TOKENS = parseInt(process.env.MAX_MULTI_CONTEXT_TOKENS || '1500');
  
  const multiContextChunks = [];
  let totalTokens = 0;

  for (const candidate of candidates.slice(0, 2)) { // Max 2 candidates
    const chunks = await getChunksForCandidate(
      {
        id: candidate.id,
        title: candidate.title,
        category: candidate.category,
        brand: candidate.brand,
        model: candidate.model
      },
      siteId
    );

    if (chunks.length > 0) {
      // Take up to 3 chunks, ~250 tokens each
      const selectedChunks = chunks.slice(0, 3).map(c => 
        c.content.substring(0, 250)
      );

      totalTokens += selectedChunks.join('').length;
      if (totalTokens > MAX_TOKENS) break;

      multiContextChunks.push({
        product: candidate.title,
        category: candidate.category || 'uncategorized',
        chunks: selectedChunks
      });
    }
  }

  if (multiContextChunks.length === 0) {
    return handleRefusal(baseInstructions);
  }

  // Build context with NO MERGE instruction
  const aiContext = multiContextChunks.map(mc => 
    `[Product: ${mc.product} - Category: ${mc.category}]\n` +
    mc.chunks.join('\n')
  ).join('\n\n---\n\n');

  const systemPrompt = `${baseInstructions}

IMPORTANT: Multiple products match this query. 
Do NOT merge specs across products. 
If the user asked about a single item (e.g., weight), answer for ONE product only. 
If uncertain, ask a brief clarifying question first.

Available contexts:
${aiContext}`;

  return {
    mode: 'multi',
    systemPrompt,
    chunks: multiContextChunks.flatMap(mc => 
      mc.chunks.map(content => ({
        content,
        source: mc.product
      }))
    )
  };
}

/**
 * Handle refusal case
 */
function handleRefusal(baseInstructions: string): ResolutionResult {
  return {
    mode: 'refusal',
    systemPrompt: baseInstructions + '\n\nYou must respond with a polite message that you don\'t have specific information about that topic. Keep it brief and natural.'
  };
}

/**
 * Fallback to simple search when smart context disabled
 */
async function fallbackToSimpleSearch(
  query: string,
  siteId: string,
  baseInstructions: string,
  timer: TelemetryTimer
): Promise<ResolutionResult> {
  try {
    timer.startSearch();
    const searchService = new VectorSearchService();
    const results = await searchService.hybridSearch(query, siteId, { limit: 6 });
    timer.endSearch();

    if (results.length === 0) {
      return handleRefusal(baseInstructions);
    }

    const contextText = results
      .slice(0, 6)
      .map(r => `[Source: ${r.materialTitle}]\n${r.content}`)
      .join('\n\n---\n\n');

    return {
      mode: 'single',
      systemPrompt: `${baseInstructions}\n\nRelevant Training Materials:\n${contextText}`,
      chunks: results.map(r => ({
        content: r.content,
        source: r.materialTitle
      }))
    };
  } catch (error) {
    console.error('Fallback search error:', error);
    return handleRefusal(baseInstructions);
  }
}