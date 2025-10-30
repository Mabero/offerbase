// Quiz Builder types (language-agnostic, JSONB-first)

export type LocaleMap = Record<string, string>; // e.g., { "en": "Question?", "no": "Spørsmål?" }

export type QuizStatus = 'draft' | 'published';

export interface QuizDefinition {
  version: number;
  start: string; // node id
  nodes: QuizNode[];
  edges: QuizEdge[];
  // Answer → effects mapping; used for scoring/constraints and explanations
  mappings?: MappingRule[];
}

export type QuizNode = QuestionNode | OutcomeNode;

export interface BaseNode {
  id: string;
  type: 'question' | 'outcome';
  title?: LocaleMap;
}

export interface QuestionOption {
  id: string;
  label: LocaleMap;
  value?: string | number | boolean | null;
  effects?: Effects; // optional direct effects when chosen
  explain?: LocaleMap; // localized why fragment
}

export interface QuestionNode extends BaseNode {
  type: 'question';
  question: LocaleMap;
  ui: {
    kind: 'single' | 'multi' | 'range' | 'input';
    min?: number; // for range
    max?: number; // for range
    step?: number;
    placeholder?: LocaleMap; // for input
  };
  options?: QuestionOption[]; // for single/multi
}

export interface OutcomeNode extends BaseNode {
  type: 'outcome';
  outcome?: {
    // strict outcome can pin to constraints or a specific offer id
    offerId?: string; // optional affiliate_links.id
    offer?: { id: string; title: string; url: string; image_url?: string | null; button_text?: string | null } | null;
    effects?: Effects; // deterministic constraints
  };
  message?: LocaleMap; // optional localized conclusion
}

export interface Condition {
  // Supports basic conditions for branch evaluation and mappings
  // Example: { nodeId: 'q1', anyOf: ['a1','a2'] }
  nodeId: string;
  anyOf?: string[]; // option ids
  allOf?: string[]; // option ids
  not?: string[];   // option ids
  // numeric comparisons for range/input
  gte?: number;
  lte?: number;
}

export interface QuizEdge {
  from: string;
  to: string;
  when?: {
    all?: Condition[];
    any?: Condition[];
  };
}

export interface Effects {
  must?: string[];   // required tags/terms
  should?: string[]; // preferred tags/terms
  exclude?: string[];// excluded tags/terms
  weights?: Record<string, number>; // weights per tag/term
  ranges?: Record<string, { min?: number; max?: number }>; // numeric constraints, e.g., budget
}

export interface MappingRule {
  when: {
    all?: Condition[];
    any?: Condition[];
  };
  effects: Effects;
  explain?: LocaleMap; // localized why explanation snippet
}

export interface TargetingRule {
  pattern: string;               // substring or regex
  type: 'substring' | 'regex';
}

export interface QuizTargeting {
  include?: TargetingRule[]; // show on URLs matching any include
  exclude?: TargetingRule[]; // hide on URLs matching any exclude
}

export interface QuizRecord {
  id: string;
  site_id: string;
  name: string;
  status: QuizStatus;
  priority: number;
  definition: QuizDefinition;
  targeting: QuizTargeting;
  version: number;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

export interface EvaluatedResult {
  done: boolean;
  nextNodeId?: string;
  outcomeNodeId?: string;
}

export interface CompiledConstraints {
  query: string; // deterministic query string to feed matcher
  contextKeywords: string[]; // tokens for contextual RPC
  why: string[]; // brief reasons (localized externally by caller)
}
