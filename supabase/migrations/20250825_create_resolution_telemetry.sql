-- Universal Resolution System Telemetry
-- Tracks all resolution decisions for optimization and debugging

-- First ensure pg_trgm extension exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create the main telemetry table
CREATE TABLE IF NOT EXISTS resolution_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  
  -- Query information (PII-scrubbed)
  query text NOT NULL,
  query_redacted boolean DEFAULT false,
  query_norm text,
  
  -- Context extraction
  extracted_terms text[] DEFAULT '{}',
  category_hint text,
  category_source text, -- 'candidate'|'material'|'page'|'site'|'none'
  
  -- Ambiguity detection
  ambiguous boolean DEFAULT false,
  ambiguous_score float,
  ambiguity_tokens text[] DEFAULT '{}',
  
  -- Candidate scoring
  candidates jsonb,  -- Array of {id, title, category, base_score, final_score, score_source}
  
  -- Decision outcome
  decision text CHECK (decision IN ('single', 'multi', 'refusal')),
  multi_context_used boolean DEFAULT false,
  multi_context_products text[],
  multi_context_tokens integer,
  
  -- Post-filtering
  postfilter_type text, -- 'brand_model'|'title_overlap'|'none'
  postfilter_survivors integer,
  
  -- Context usage
  page_context_used boolean DEFAULT false,
  
  -- Performance metrics
  latency_ms integer,
  search_latency_ms integer,
  
  -- Boost tracking
  boosts_applied jsonb, -- {terms: [], category_boost: number}
  max_total_boost_applied float,
  
  -- Multilingual
  multilingual_fallback boolean DEFAULT false,
  score_source text, -- Winner's score source: 'fts' or 'trgm'
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE resolution_telemetry ENABLE ROW LEVEL SECURITY;

-- Create service role policy
CREATE POLICY "Service role full access" ON resolution_telemetry
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_telemetry_lookup 
  ON resolution_telemetry(site_id, created_at DESC);

CREATE INDEX idx_telemetry_decision 
  ON resolution_telemetry(decision);

-- Add foreign key constraint to sites
ALTER TABLE resolution_telemetry 
  ADD CONSTRAINT fk_resolution_telemetry_site 
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE resolution_telemetry IS 'Tracks all universal resolution decisions for G3/G4 disambiguation and cross-domain product matching';
COMMENT ON COLUMN resolution_telemetry.query IS 'Original user query with PII scrubbed';
COMMENT ON COLUMN resolution_telemetry.candidates IS 'JSON array of candidate products with all scoring details';
COMMENT ON COLUMN resolution_telemetry.decision IS 'Final decision: single product selected, multi-context used, or refusal';
COMMENT ON COLUMN resolution_telemetry.multilingual_fallback IS 'True if trigram search was used for CJK/Thai text';