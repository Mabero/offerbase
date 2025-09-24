import { createClient } from '@supabase/supabase-js';
import { normalizeText } from './normalization';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Offer resolution decision types
 * - single: One clear winner, show product card
 * - multiple: Multiple close matches, optional clarification 
 * - none: No good matches, no card
 */
export type OfferDecision = 'single' | 'multiple' | 'none';

/**
 * Resolved offer candidate
 */
export interface OfferCandidate {
  offer_id: string;
  title: string;
  brand?: string;
  model?: string;
  brand_norm?: string;  // For post-filtering
  model_norm?: string;  // For post-filtering
  url: string;
  description?: string;
  alias_score: number;
  fts_score: number;
  total_score: number;  // Computed: alias_score * 1.0 + fts_score * 0.7
}

/**
 * Offer resolution hint (UI only, stateless)
 */
export interface OfferHint {
  type: OfferDecision;
  offer?: OfferCandidate;           // Single winner
  alternatives?: OfferCandidate[];   // Multiple candidates for clarification
  query_norm: string;               // Normalized query for debugging
}

/**
 * Resolve offer hint for UI rendering (stateless)
 * 
 * This function:
 * 1. Normalizes the query
 * 2. Calls search_offers_stateless RPC 
 * 3. Computes explicit total_score = alias_score * 1.0 + fts_score * 0.7
 * 4. Applies decision thresholds (single/multiple/none)
 * 5. Logs telemetry for debugging
 * 6. Returns UI hint (no persistent state)
 * 
 * @param query - Raw user query
 * @param siteId - Site UUID
 * @returns Promise<OfferHint> - UI rendering hint
 */
export async function resolveOfferHint(
  query: string,
  siteId: string
): Promise<OfferHint> {
  const queryNorm = normalizeText(query);
  
  try {
    // Call the stateless search RPC
    const { data, error } = await supabase.rpc('search_offers_stateless', {
      p_query_norm: queryNorm,
      p_site_id: siteId
    });
    
    if (error) {
      console.error('Offer search RPC error:', error);
      await logResolution(siteId, query, queryNorm, 'none', [], false);
      return { type: 'none', query_norm: queryNorm };
    }
    
    if (!data || data.length === 0) {
      await logResolution(siteId, query, queryNorm, 'none', [], false);
      return { type: 'none', query_norm: queryNorm };
    }
    
    // EXPLICIT SCORING (Requirement #4 from plan)
    // Compute total_score = alias_score * 1.0 + fts_score * 0.7
    const candidates: OfferCandidate[] = data.map((row: any) => ({
      offer_id: row.offer_id,
      title: row.title,
      brand: row.brand,
      model: row.model,
      brand_norm: row.brand_norm,
      model_norm: row.model_norm,
      url: row.url,
      description: row.description,
      alias_score: row.alias_score || 0,
      fts_score: row.fts_score || 0,
      total_score: (row.alias_score || 0) * 1.0 + (row.fts_score || 0) * 0.7
    })).sort((a: any, b: any) => b.total_score - a.total_score);
    
    // Decision logic with explicit thresholds
    let decision: OfferDecision;
    let cardRendered = false;
    let winner: OfferCandidate | undefined;
    let alternatives: OfferCandidate[] | undefined;
    
    const topScore = candidates[0].total_score;
    const secondScore = candidates[1]?.total_score || 0;
    const scoreGap = topScore - secondScore;
    
    // Decision thresholds based on plan requirements
    if (topScore >= 0.7 && scoreGap > 0.2) {
      // Strong single winner - show product card
      decision = 'single';
      cardRendered = true;
      winner = candidates[0];
    } else if (candidates.length > 1 && topScore > 0.4) {
      // Multiple candidates close together - optional clarification
      decision = 'multiple';
      cardRendered = false;
      alternatives = candidates.slice(0, 3); // Top 3 for clarification
    } else {
      // No strong signal - no card
      decision = 'none';
      cardRendered = false;
    }
    
    // Log telemetry (async, non-blocking)
    await logResolution(siteId, query, queryNorm, decision, candidates, cardRendered);
    
    return {
      type: decision,
      offer: winner,
      alternatives: alternatives,
      query_norm: queryNorm
    };
    
  } catch (error) {
    console.error('Offer resolution error:', error);
    await logResolution(siteId, query, queryNorm, 'none', [], false);
    return { type: 'none', query_norm: queryNorm };
  }
}

/**
 * Log offer resolution for telemetry and debugging
 * Requirement #6: Complete telemetry fields
 * 
 * @param siteId - Site UUID
 * @param query - Original query
 * @param queryNorm - Normalized query
 * @param decision - Resolution decision type
 * @param candidates - Top candidates with scores
 * @param cardRendered - Whether UI card will be shown
 */
async function logResolution(
  siteId: string,
  query: string,
  queryNorm: string,
  decision: OfferDecision,
  candidates: OfferCandidate[],
  cardRendered: boolean
): Promise<void> {
  // Async, non-blocking telemetry
  setImmediate(async () => {
    try {
      await supabase.from('offers_resolution_log').insert({
        site_id: siteId,
        query: query,
        query_norm: queryNorm,
        decision: decision,
        top_candidates: candidates.slice(0, 3).map(c => ({
          offer_id: c.offer_id,
          title: c.title,
          alias_score: c.alias_score,
          fts_score: c.fts_score,
          total_score: c.total_score  // Log computed score for debugging
        })),
        card_rendered: cardRendered
      });
    } catch (error) {
      // Don't let telemetry errors break the main flow
      console.error('Telemetry logging error:', error);
    }
  });
}

/**
 * Get offer details by ID (for follow-up queries)
 * Used when user clicks on clarification options
 */
export async function getOfferById(offerId: string, siteId: string): Promise<OfferCandidate | null> {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select('id, title, brand, model, brand_norm, model_norm, url, description')
      .eq('id', offerId)
      .eq('site_id', siteId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      offer_id: data.id,
      title: data.title,
      brand: data.brand,
      model: data.model,
      brand_norm: data.brand_norm,
      model_norm: data.model_norm,
      url: data.url,
      description: data.description,
      alias_score: 1.0,  // Explicit lookup
      fts_score: 0,
      total_score: 1.0
    };
    
  } catch (error) {
    console.error('Get offer by ID error:', error);
    return null;
  }
}

/**
 * Check if query likely refers to a specific model (G3, G4, etc.)
 * Used for post-filter decision making
 */
export function isModelQuery(query: string): boolean {
  const normalized = normalizeText(query);
  const modelPattern = /\b[a-z]+\d+\b/g;
  return modelPattern.test(normalized);
}

/**
 * Extract model references from query (for debugging)
 * Helps identify when G3/G4 confusion might occur
 */
export function extractModelReferences(query: string): string[] {
  const normalized = normalizeText(query);
  const modelPattern = /\b[a-z]+\d+\b/g;
  return normalized.match(modelPattern) || [];
}
