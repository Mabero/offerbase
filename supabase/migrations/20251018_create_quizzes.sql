-- Quiz Builder core tables (idempotent, JSONB-first for extensibility)
-- Scope: multiple quizzes per site, URL targeting, draft/published

BEGIN;

-- Quizzes table
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft', -- draft | published
  priority integer NOT NULL DEFAULT 0,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb, -- quiz graph, nodes/edges/mappings by locale
  targeting jsonb NOT NULL DEFAULT '{"include": [], "exclude": []}'::jsonb, -- URL rules
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  CONSTRAINT quizzes_status_chk CHECK (status IN ('draft','published'))
);

-- Basic index for site scoping and selection policy
CREATE INDEX IF NOT EXISTS quizzes_site_status_idx ON public.quizzes (site_id, status, priority DESC, updated_at DESC);

-- Quiz sessions table (lightweight analytics + continuity)
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  language text NULL,
  context jsonb NULL, -- utm, referrer, page path, device features
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS quiz_sessions_quiz_idx ON public.quiz_sessions (quiz_id, started_at DESC);

-- Quiz answers table (optional; can be used for analytics/debug)
CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  answer_id text NULL,
  value jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_answers_session_idx ON public.quiz_answers (session_id, created_at);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_quizzes_updated_at ON public.quizzes;
CREATE TRIGGER set_quizzes_updated_at
BEFORE UPDATE ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

