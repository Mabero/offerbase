// Types for the Predefined Questions feature

export interface PredefinedQuestion {
  id: string;
  site_id: string;
  question: string;
  answer?: string; // Optional - if empty, AI handles the question
  priority: number;
  is_site_wide: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  question_url_rules?: QuestionUrlRule[];
}

export interface QuestionUrlRule {
  id: string;
  question_id: string;
  rule_type: UrlRuleType;
  pattern: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UrlRuleType = 'exact' | 'contains' | 'exclude';

// For creating/updating questions
export interface CreatePredefinedQuestionRequest {
  question: string;
  answer?: string; // Optional - if empty, AI handles the question
  priority?: number;
  is_site_wide?: boolean;
  is_active?: boolean;
  url_rules?: CreateUrlRuleRequest[];
}

export interface UpdatePredefinedQuestionRequest {
  question?: string;
  answer?: string;
  priority?: number;
  is_site_wide?: boolean;
  is_active?: boolean;
  url_rules?: UpdateUrlRuleRequest[];
}

export interface CreateUrlRuleRequest {
  rule_type: UrlRuleType;
  pattern: string;
  is_active?: boolean;
}

export interface UpdateUrlRuleRequest {
  id?: string; // If provided, update existing rule; if not, create new
  rule_type: UrlRuleType;
  pattern: string;
  is_active?: boolean;
  _delete?: boolean; // Mark for deletion
}

// For URL matching functionality
export interface UrlMatchingOptions {
  url: string;
  includeInactive?: boolean;
  maxResults?: number;
}

export interface MatchingQuestion {
  question: PredefinedQuestion;
  matchedRules: QuestionUrlRule[];
  priority: number;
}

export interface UrlMatchResult {
  questions: MatchingQuestion[];
  totalCount: number;
  siteWideCount: number;
  urlSpecificCount: number;
}

// For pattern testing
export interface PatternTestRequest {
  pattern: string;
  rule_type: UrlRuleType;
  test_urls: string[];
}

export interface PatternTestResult {
  pattern: string;
  rule_type: UrlRuleType;
  tests: {
    url: string;
    matches: boolean;
    explanation: string;
  }[];
}

// For the admin interface
export interface PredefinedQuestionFormData {
  question: string;
  answer: string; // Keep as required for form - validation will check if empty
  priority: number;
  is_site_wide: boolean;
  is_active: boolean;
  url_rules: UrlRuleFormData[];
}

export interface UrlRuleFormData {
  id?: string;
  rule_type: UrlRuleType;
  pattern: string;
  is_active: boolean;
  isNew?: boolean;
  isDeleted?: boolean;
}

// For the chat widget
export interface PredefinedQuestionButton {
  id: string;
  question: string;
  answer?: string; // Optional - if empty, AI handles the question
  priority: number;
}

export interface PredefinedQuestionsComponentProps {
  questions: PredefinedQuestionButton[];
  onQuestionClick: (question: PredefinedQuestionButton) => void;
  chatSettings?: {
    chat_color?: string;
  };
  isVisible?: boolean;
  className?: string;
}

// API Response types
export interface PredefinedQuestionsApiResponse {
  questions: PredefinedQuestion[];
  total: number;
  page?: number;
  limit?: number;
}

export interface PredefinedQuestionApiResponse {
  question: PredefinedQuestion;
}

export interface UrlMatchApiResponse {
  questions: PredefinedQuestionButton[];
  matchCount: number;
  pageUrl: string;
}

// Error types
export interface PredefinedQuestionError {
  field?: keyof PredefinedQuestion | keyof QuestionUrlRule;
  message: string;
  code?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: PredefinedQuestionError[];
  warnings: string[];
}

// Search/Filter types for admin interface
export interface PredefinedQuestionFilters {
  search?: string;
  is_active?: boolean;
  is_site_wide?: boolean;
  priority_min?: number;
  priority_max?: number;
  has_url_rules?: boolean;
}

export interface PredefinedQuestionSort {
  field: keyof PredefinedQuestion;
  direction: 'asc' | 'desc';
}

// Bulk operations
export interface BulkUpdateRequest {
  question_ids: string[];
  updates: Partial<Pick<PredefinedQuestion, 'is_active' | 'priority'>>;
}

export interface BulkDeleteRequest {
  question_ids: string[];
}

export interface BulkOperationResult {
  success: boolean;
  updated_count: number;
  failed_ids?: string[];
  errors?: PredefinedQuestionError[];
}

// URL Matcher class types (for the service)
export interface UrlMatcherConfig {
  caseSensitive?: boolean;
  normalizeUrl?: boolean;
  maxPatternLength?: number;
}

export interface UrlNormalizationOptions {
  removeTrailingSlash?: boolean;
  removeQueryParams?: boolean;
  removeFragment?: boolean;
  lowercaseHost?: boolean;
}

// Statistics and analytics types (for future use)
export interface PredefinedQuestionStats {
  total_questions: number;
  active_questions: number;
  site_wide_questions: number;
  url_specific_questions: number;
  questions_with_rules: number;
  avg_priority: number;
  most_used_rule_types: {
    rule_type: UrlRuleType;
    count: number;
  }[];
}

// Export convenience type unions
export type PredefinedQuestionWithRules = PredefinedQuestion & {
  question_url_rules: QuestionUrlRule[];
};

export type PredefinedQuestionFormField = keyof PredefinedQuestionFormData;
export type UrlRuleFormField = keyof UrlRuleFormData;