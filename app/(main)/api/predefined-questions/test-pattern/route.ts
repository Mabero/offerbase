import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { sanitizePattern, sanitizeUrl } from '@/lib/validation';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { z } from 'zod';

// Pattern test request schema
const patternTestSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required').max(200, 'Pattern too long'),
  rule_type: z.enum(['exact', 'contains', 'regex', 'starts_with', 'ends_with']),
  test_urls: z.array(z.string().url('Invalid URL format'))
    .min(1, 'At least one test URL is required')
    .max(20, 'Maximum 20 test URLs allowed')
});

// Query schema for GET request
const patternSuggestionsSchema = z.object({
  sampleUrl: z.string().url('Invalid sample URL format').optional()
});

// POST /api/predefined-questions/test-pattern - Test URL pattern matching
export const POST = createAPIRoute(
  {
    requireAuth: true,
    bodySchema: patternTestSchema,
    allowedMethods: ['POST']
  },
  async (context) => {
    const { body } = context;
    const { pattern, rule_type, test_urls } = body as z.infer<typeof patternTestSchema>;

    // Sanitize the pattern
    const sanitizedPattern = sanitizePattern(pattern);
    
    // Sanitize test URLs
    const sanitizedTestUrls = test_urls.map(url => sanitizeUrl(url));

    // Validate pattern using URL matcher
    const validation = defaultUrlMatcher.validatePattern?.(sanitizedPattern, rule_type);
    if (validation && !validation.isValid) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse(`Invalid pattern: ${validation.errors.join(', ')}`, 400);
    }

    // Test the pattern against all URLs
    const testResult = defaultUrlMatcher.testPattern?.(
      sanitizedPattern,
      rule_type,
      sanitizedTestUrls
    ) || {
      pattern: sanitizedPattern,
      rule_type,
      test_urls: sanitizedTestUrls,
      results: sanitizedTestUrls.map(url => {
        try {
          const isMatch = defaultUrlMatcher(url, rule_type, sanitizedPattern);
          return { url, isMatch, error: null };
        } catch (error) {
          return { 
            url, 
            isMatch: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      }),
      summary: {
        total: sanitizedTestUrls.length,
        matches: 0,
        errors: 0
      }
    };

    // Calculate summary if not provided
    if (!testResult.summary) {
      const matches = testResult.results.filter(r => r.isMatch).length;
      const errors = testResult.results.filter(r => r.error).length;
      testResult.summary = {
        total: testResult.results.length,
        matches,
        errors
      };
    }

    return createSuccessResponse(testResult, 'Pattern test completed successfully');
  }
);

// GET /api/predefined-questions/test-pattern - Get pattern suggestions
export const GET = createAPIRoute(
  {
    requireAuth: true,
    querySchema: patternSuggestionsSchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { query } = context;
    const { sampleUrl } = query as z.infer<typeof patternSuggestionsSchema>;

    // Get pattern suggestions based on sample URL
    const suggestions = defaultUrlMatcher.getPatternSuggestions?.(
      sampleUrl ? sanitizeUrl(sampleUrl) : undefined
    ) || [
      {
        type: 'exact',
        pattern: sampleUrl || 'https://example.com/page',
        description: 'Matches exactly this URL'
      },
      {
        type: 'contains',
        pattern: sampleUrl ? new URL(sampleUrl).pathname : '/page',
        description: 'Matches any URL containing this path'
      },
      {
        type: 'starts_with',
        pattern: sampleUrl ? new URL(sampleUrl).origin : 'https://example.com',
        description: 'Matches URLs starting with this domain'
      }
    ];

    return createSuccessResponse({ suggestions }, 'Pattern suggestions generated successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();