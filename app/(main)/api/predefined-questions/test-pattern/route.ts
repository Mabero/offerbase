import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sanitizePattern, sanitizeUrl } from '@/lib/validation';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { z } from 'zod';

// Pattern test request schema
const patternTestSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required').max(200, 'Pattern too long'),
  rule_type: z.enum(['exact', 'contains', 'exclude']),
  test_urls: z.array(z.string().url('Invalid URL format'))
    .min(1, 'At least one test URL is required')
    .max(20, 'Maximum 20 test URLs allowed')
});

// Query schema for GET request
const patternSuggestionsSchema = z.object({
  sampleUrl: z.string().url('Invalid sample URL format').optional()
});

// Helper functions
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

function createErrorResponse(message: string, status: number = 500) {
  const response = NextResponse.json({ error: message }, { status });
  return addCorsHeaders(response);
}

function createSuccessResponse(data: unknown, message?: string, status: number = 200) {
  const response = NextResponse.json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  }, { status });
  return addCorsHeaders(response);
}

// POST /api/predefined-questions/test-pattern - Test URL pattern matching
export async function POST(request: NextRequest) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 400);
    }

    const validation = patternTestSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ');
      return createErrorResponse(errorMessage, 400);
    }

    const { pattern, rule_type, test_urls } = validation.data;

    // Sanitize the pattern
    const sanitizedPattern = sanitizePattern(pattern);
    
    // Sanitize test URLs
    const sanitizedTestUrls = test_urls.map(url => sanitizeUrl(url));

    // Validate pattern using URL matcher
    const validation2 = defaultUrlMatcher.validatePattern?.(sanitizedPattern, rule_type);
    if (validation2 && !validation2.isValid) {
      return createErrorResponse(`Invalid pattern: ${validation2.errors.join(', ')}`, 400);
    }

    // Test the pattern against all URLs using a mock question approach
    const testResult = {
      pattern: sanitizedPattern,
      rule_type,
      test_urls: sanitizedTestUrls,
      results: sanitizedTestUrls.map(url => {
        try {
          // Create a mock question with the rule to test
          const mockQuestion = {
            id: 'test',
            question: 'test',
            answer: 'test',
            is_active: true,
            is_site_wide: false,
            priority: 50,
            site_id: 'test',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            question_url_rules: [{
              id: 'test-rule',
              question_id: 'test',
              rule_type: rule_type,
              pattern: sanitizedPattern,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }]
          };
          
          const isMatch = defaultUrlMatcher.matchesQuestion(url, mockQuestion);
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

    // Calculate summary
    const matches = testResult.results.filter(r => r.isMatch).length;
    const errors = testResult.results.filter(r => r.error).length;
    testResult.summary = {
      total: testResult.results.length,
      matches,
      errors
    };

    return createSuccessResponse(testResult, 'Pattern test completed successfully');

  } catch (error) {
    console.error('POST /api/predefined-questions/test-pattern error:', error);
    return createErrorResponse('Internal server error');
  }
}

// GET /api/predefined-questions/test-pattern - Get pattern suggestions
export async function GET(request: NextRequest) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const sampleUrl = searchParams.get('sampleUrl');

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

  } catch (error) {
    console.error('GET /api/predefined-questions/test-pattern error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/predefined-questions/test-pattern - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}