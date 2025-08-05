import { z } from 'zod';
import { NextRequest } from 'next/server';

// Maximum message length to prevent token flooding
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATION_HISTORY = 20;
const MAX_SINGLE_MESSAGE_LENGTH = 1000;

// Chat API request validation schema
export const chatRequestSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`)
    .trim()
    .refine(
      (msg) => msg.length > 0 && /\S/.test(msg), 
      "Message must contain non-whitespace characters"
    ),
  
  siteId: z.string()
    .uuid("Invalid site ID format")
    .min(1, "Site ID is required"),
  
  sessionId: z.string()
    .uuid("Invalid session ID format")
    .optional(),
  
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant'], {
        errorMap: () => ({ message: "Role must be either 'user' or 'assistant'" })
      }),
      content: z.string()
        .min(1, "Message content cannot be empty")
        .max(MAX_SINGLE_MESSAGE_LENGTH, `Single message cannot exceed ${MAX_SINGLE_MESSAGE_LENGTH} characters`)
        .trim()
    })
  )
    .max(MAX_CONVERSATION_HISTORY, `Conversation history cannot exceed ${MAX_CONVERSATION_HISTORY} messages`)
    .default([])
});

// Affiliate link validation schema
export const affiliateLinkSchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  url: z.string()
    .url("Invalid URL format")
    .max(2000, "URL too long")
    .refine(
      (url) => !url.includes('javascript:') && !url.includes('data:'),
      "URL contains potentially dangerous protocol"
    ),
  title: z.string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .trim(),
  description: z.string()
    .max(500, "Description too long")
    .trim()
    .optional(),
  image_url: z.string()
    .url("Invalid image URL format")
    .max(2000, "Image URL too long")
    .optional()
    .or(z.literal("")),
  button_text: z.string()
    .max(50, "Button text too long")
    .trim()
    .optional()
});

// Chat settings validation schema
export const chatSettingsSchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  chat_name: z.string()
    .max(50, "Chat name too long")
    .trim()
    .optional(),
  chat_color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .optional(),
  chat_icon_url: z.string()
    .url("Invalid icon URL format")
    .max(2000, "Icon URL too long")
    .optional()
    .or(z.literal("")),
  chat_name_color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .optional(),
  chat_bubble_icon_color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format")
    .optional(),
  input_placeholder: z.string()
    .max(100, "Placeholder too long")
    .trim()
    .optional(),
  font_size: z.string()
    .regex(/^\d+px$/, "Font size must be in px format")
    .optional(),
  intro_message: z.string()
    .max(500, "Intro message too long")
    .trim()
    .optional(),
  instructions: z.string()
    .max(2000, "Instructions too long")
    .trim()
    .optional(),
  preferred_language: z.string()
    .max(10, "Language code too long")
    .trim()
    .optional()
});

// Sanitization utilities
export function sanitizeString(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

export function sanitizeHtml(input: string): string {
  // Basic HTML sanitization - remove dangerous elements and attributes
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
    .replace(/javascript:/gi, '')
    .trim();
}

// Validation middleware helper
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details?: z.ZodError } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      const errorMessage = firstError?.message || "Validation failed";
      return { 
        success: false, 
        error: errorMessage,
        details: error
      };
    }
    return { 
      success: false, 
      error: "Validation failed due to unexpected error" 
    };
  }
}

// Rate limiting validation
export function validateRateLimitHeaders(request: NextRequest): {
  ip: string;
  userAgent: string;
  userId?: string;
} {
  // Get client IP with fallbacks
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  
  // Get user agent
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Get user ID from headers if available
  const userId = request.headers.get('x-user-id') || undefined;
  
  return { ip, userAgent, userId };
}

// Content length validation for streaming/large payloads
export function validateContentLength(request: NextRequest, maxBytes: number = 100 * 1024): boolean {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return true; // No content-length header
  
  const length = parseInt(contentLength, 10);
  return !isNaN(length) && length <= maxBytes;
}

// Request origin validation for CORS
export function validateOrigin(request: NextRequest, allowedOrigins: string[] = []): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // No origin header for same-origin requests
  
  // Allow localhost and development origins
  if (process.env.NODE_ENV === 'development') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true;
    }
  }
  
  // Check against allowed origins
  return allowedOrigins.length === 0 || allowedOrigins.includes(origin);
}

// Sites validation schemas
export const siteCreateSchema = z.object({
  name: z.string()
    .min(1, "Site name is required")
    .max(100, "Site name too long")
    .trim()
    .refine(
      (name) => /^[a-zA-Z0-9\s\-_.]+$/.test(name),
      "Site name contains invalid characters"
    ),
  description: z.string()
    .max(500, "Description too long")
    .trim()
    .optional()
});

export const siteUpdateSchema = z.object({
  name: z.string()
    .min(1, "Site name is required")
    .max(100, "Site name too long")
    .trim()
    .optional(),
  description: z.string()
    .max(500, "Description too long")
    .trim()
    .optional()
});

// Training materials validation schemas
export const trainingMaterialCreateSchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  url: z.string()
    .url("Invalid URL format")
    .max(2000, "URL too long")
    .refine(
      (url) => !url.includes('javascript:') && !url.includes('data:'),
      "URL contains potentially dangerous protocol"
    ),
  title: z.string()
    .max(200, "Title too long")
    .trim()
    .optional(),
  content_type: z.enum(['webpage', 'pdf', 'document', 'video', 'other'])
    .optional()
});

// Predefined questions validation schemas
export const predefinedQuestionSchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  question: z.string()
    .min(1, "Question is required")
    .max(500, "Question too long")
    .trim(),
  answer: z.string()
    .min(1, "Answer is required")
    .max(2000, "Answer too long")
    .trim(),
  pattern: z.string()
    .max(200, "Pattern too long")
    .trim()
    .optional(),
  is_active: z.boolean().default(true),
  priority: z.number()
    .min(0, "Priority must be non-negative")
    .max(100, "Priority too high")
    .default(50)
});

// Analytics validation schemas
export const analyticsEventSchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  event_type: z.enum([
    'widget_opened',
    'widget_closed', 
    'message_sent',
    'link_clicked',
    'session_started',
    'session_ended'
  ]),
  event_data: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
  user_session_id: z.string().optional()
});

// Query parameter validation schemas
export const siteIdQuerySchema = z.object({
  siteId: z.string().uuid("Invalid site ID format")
});

export const paginationQuerySchema = z.object({
  page: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val > 0, "Page must be positive"),
  limit: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val > 0 && val <= 100, "Limit must be between 1 and 100")
});

export const analyticsQuerySchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: z.string().optional()
});

// Session validation schemas
export const sessionQuerySchema = z.object({
  siteId: z.string().uuid("Invalid site ID format"),
  limit: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val > 0 && val <= 50, "Limit must be between 1 and 50")
});

// Advanced sanitization functions
export function sanitizeUrl(input: string): string {
  // Remove dangerous protocols and normalize URL
  return input
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/file:/gi, '')
    .trim();
}

export function sanitizeFileName(input: string): string {
  // Remove path traversal and dangerous characters
  return input
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\.\./g, '')
    .replace(/^\.+/, '')
    .trim()
    .substring(0, 255);
}

export function sanitizePattern(input: string): string {
  // Sanitize regex patterns to prevent ReDoS attacks
  return input
    .replace(/\*{3,}/g, '**') // Limit consecutive wildcards
    .replace(/\+{3,}/g, '++') // Limit consecutive plus signs
    .replace(/\{(\d+),(\d+)\}/g, (match, min, max) => {
      // Limit quantifier ranges
      const minNum = Math.min(parseInt(min, 10) || 0, 100);
      const maxNum = Math.min(parseInt(max, 10) || 1, 100);
      return `{${minNum},${maxNum}}`;
    })
    .trim()
    .substring(0, 200);
}

// Type exports for use in API routes
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type AffiliateLink = z.infer<typeof affiliateLinkSchema>;
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export type SiteCreate = z.infer<typeof siteCreateSchema>;
export type SiteUpdate = z.infer<typeof siteUpdateSchema>;
export type TrainingMaterialCreate = z.infer<typeof trainingMaterialCreateSchema>;
export type PredefinedQuestion = z.infer<typeof predefinedQuestionSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type SiteIdQuery = z.infer<typeof siteIdQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type SessionQuery = z.infer<typeof sessionQuerySchema>;

// Validation error response helper
export function createValidationErrorResponse(error: string, status: number = 400) {
  return Response.json(
    { 
      error: "Validation Error", 
      message: error,
      timestamp: new Date().toISOString()
    },
    { 
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    }
  );
}