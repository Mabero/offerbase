// FILE PURPOSE: TypeScript type definitions for training materials, AI responses, and chat data

export interface TrainingMaterial {
  id: string;
  site_id: string;
  url: string;
  title: string;
  content?: string | null;
  content_type?: 'webpage' | 'article' | 'product' | 'faq' | 'documentation';
  metadata?: TrainingMetadata;
  scrape_status?: 'pending' | 'processing' | 'success' | 'failed';
  last_scraped_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingMetadata {
  title?: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  images?: string[];
  mainImage?: string;
  keywords?: string[];
  structuredData?: Record<string, any>;
  productInfo?: ProductInfo;
  contentLength?: number;
  language?: string;
  siteName?: string;
  // Index signature for compatibility with Record<string, unknown>
  [key: string]: unknown;
}

export interface ProductInfo {
  name?: string;
  price?: string;
  currency?: string;
  availability?: string;
  brand?: string;
  category?: string;
  sku?: string;
  rating?: number;
  reviewCount?: number;
  features?: string[];
  specifications?: Record<string, string>;
}

export interface ScrapeRequest {
  url: string;
  options?: ScrapeOptions;
}

export interface ScrapeOptions {
  waitForSelector?: string;
  timeout?: number;
  extractImages?: boolean;
  extractStructuredData?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface ScrapeResult {
  success: boolean;
  content?: string;
  metadata?: TrainingMetadata;
  contentType?: string;
  error?: string;
  screenshot?: string;
}

export interface ContentChunk {
  id: string;
  training_material_id: string;
  chunk_index: number;
  content: string;
  embedding?: number[];
  metadata?: {
    section?: string;
    subsection?: string;
    importance?: number;
  };
}

// Structured AI Response Types
export interface StructuredAIResponse {
  message: string;
  show_simple_link?: boolean;
  link_text?: string;
  link_url?: string;
  products?: string[];  // AI-selected product IDs for intelligent recommendations
}

export interface AIResponseParseResult {
  success: boolean;
  structured?: StructuredAIResponse;
  fallback_text?: string;
  error?: string;
}