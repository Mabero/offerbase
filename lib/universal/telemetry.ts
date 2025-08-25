/**
 * Non-Blocking Telemetry Logging
 * Fire-and-forget telemetry that doesn't impact user response times
 */

import { createClient } from '@supabase/supabase-js';
import { scrubPII } from '../context/safe-extract';

export interface TelemetryData {
  site_id: string;
  query: string;
  query_redacted?: boolean;
  query_norm: string;
  extracted_terms: string[];
  category_hint?: string;
  category_source: string;
  ambiguous: boolean;
  ambiguous_score: number;
  ambiguity_tokens: string[];
  candidates: Array<{
    id: string;
    title: string;
    category?: string;
    brand?: string;
    model?: string;
    base_score: number;
    final_score: number;
    score_source: 'fts' | 'trgm';
  }>;
  decision: 'single' | 'multi' | 'refusal';
  multi_context_used?: boolean;
  multi_context_products?: string[];
  multi_context_tokens?: number;
  postfilter_type?: string;
  postfilter_survivors?: number;
  page_context_used: boolean;
  latency_ms: number;
  search_latency_ms: number;
  boosts_applied: {
    terms: string[];
    category_boost: number;
  };
  max_total_boost_applied: number;
  multilingual_fallback: boolean;
  score_source: 'fts' | 'trgm';
}

/**
 * Log telemetry data without blocking the main response
 * Uses fire-and-forget pattern with error swallowing
 */
export function logTelemetryNonBlocking(data: TelemetryData): void {
  // Don't await - let it run in background
  setImmediate(async () => {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // Apply PII scrubbing to query if not already done
      const { text: scrubbed_query, redacted } = scrubPII(data.query);

      const telemetryRecord = {
        site_id: data.site_id,
        query: scrubbed_query,
        query_redacted: redacted || data.query_redacted || false,
        query_norm: data.query_norm,
        extracted_terms: data.extracted_terms,
        category_hint: data.category_hint,
        category_source: data.category_source,
        ambiguous: data.ambiguous,
        ambiguous_score: data.ambiguous_score,
        ambiguity_tokens: data.ambiguity_tokens,
        candidates: data.candidates,
        decision: data.decision,
        multi_context_used: data.multi_context_used || false,
        multi_context_products: data.multi_context_products || [],
        multi_context_tokens: data.multi_context_tokens,
        postfilter_type: data.postfilter_type,
        postfilter_survivors: data.postfilter_survivors,
        page_context_used: data.page_context_used,
        latency_ms: data.latency_ms,
        search_latency_ms: data.search_latency_ms,
        boosts_applied: data.boosts_applied,
        max_total_boost_applied: data.max_total_boost_applied,
        multilingual_fallback: data.multilingual_fallback,
        score_source: data.score_source
      };

      await supabase
        .from('resolution_telemetry')
        .insert(telemetryRecord);

      // Success - no logging needed to avoid noise
    } catch (error) {
      // Swallow errors silently - telemetry failures should not impact users
      // Only log if in development mode
      if (process.env.NODE_ENV === 'development') {
        console.error('Telemetry failed (non-blocking):', error);
      }
    }
  });
}

/**
 * Helper to calculate telemetry latency
 */
export class TelemetryTimer {
  private startTime: number;
  private searchStartTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  startSearch() {
    this.searchStartTime = Date.now();
  }

  endSearch(): number {
    if (!this.searchStartTime) return 0;
    return Date.now() - this.searchStartTime;
  }

  getTotalLatency(): number {
    return Date.now() - this.startTime;
  }
}