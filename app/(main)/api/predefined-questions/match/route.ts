import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeUrl } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { z } from 'zod';

// Helper function to get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

// GET /api/predefined-questions/match - Match questions to page URL (public endpoint for widget)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const pageUrl = searchParams.get('pageUrl');
    const maxResults = parseInt(searchParams.get('maxResults') || '4', 10);

    if (!siteId) {
      return createErrorResponse('Site ID is required', 400);
    }

    if (!pageUrl) {
      return createErrorResponse('Page URL is required', 400);
    }

    // Validate UUID format
    try {
      z.string().uuid().parse(siteId);
    } catch {
      return createErrorResponse('Invalid site ID format', 400);
    }

    // Validate URL format
    try {
      new URL(pageUrl);
    } catch {
      return createErrorResponse('Invalid page URL format', 400);
    }
    
    // Sanitize the page URL
    const sanitizedPageUrl = sanitizeUrl(pageUrl);
    
    // Build cache key based on site and page URL
    const cacheKey = getCacheKey(siteId, `question_match_${Buffer.from(sanitizedPageUrl).toString('base64')}_${maxResults}`);
    
    // Try to get from cache first
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return createSuccessResponse(cached, 'Question matches fetched from cache');
      }
    } catch (cacheError) {
      console.warn('Cache read failed:', cacheError);
      // Continue without cache
    }

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Fetch active predefined questions with URL rules
    const { data: allQuestions, error } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        site_id,
        question,
        answer,
        priority,
        is_site_wide,
        is_active,
        created_at,
        updated_at,
        question_url_rules (
          id,
          question_id,
          rule_type,
          pattern,
          is_active,
          created_at,
          updated_at
        )
      `)
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Questions fetch error:', error);
      return createErrorResponse('Failed to fetch questions');
    }

    const questions = allQuestions || [];

    // Filter questions based on URL matching
    const matchedQuestions = [];
    
    for (const question of questions) {
      let isMatch = false;
      
      // Check if it's a site-wide question (always matches)
      if (question.is_site_wide) {
        isMatch = true;
      } else {
        // Check URL rules
        const activeRules = question.question_url_rules?.filter(rule => rule.is_active) || [];
        
        if (activeRules.length === 0) {
          // No URL rules means it's site-wide by default
          isMatch = true;
        } else {
          // Check each rule
          for (const rule of activeRules) {
            try {
              // Create a mock question object to use the public matchesQuestion method
              const mockQuestion = {
                ...question,
                question_url_rules: [rule]
              };
              
              if (defaultUrlMatcher.matchesQuestion(sanitizedPageUrl, mockQuestion)) {
                isMatch = true;
                break;
              }
            } catch (error) {
              console.error(`Error matching URL rule ${rule.id}:`, error);
              // Continue with other rules
            }
          }
        }
      }
      
      if (isMatch) {
        // Remove internal fields from response
        const { question_url_rules, ...questionData } = question;
        matchedQuestions.push(questionData);
        
        // Stop when we have enough results
        if (matchedQuestions.length >= maxResults) {
          break;
        }
      }
    }

    const response = {
      questions: matchedQuestions,
      pageUrl: sanitizedPageUrl,
      siteId,
      matchCount: matchedQuestions.length,
      total: questions.length
    };

    // Cache for 10 minutes
    try {
      await cache.set(cacheKey, response, 600);
    } catch (cacheError) {
      console.warn('Cache write failed:', cacheError);
      // Continue without caching
    }

    return createSuccessResponse(response, 'Question matches found successfully');

  } catch (error) {
    console.error('GET /api/predefined-questions/match error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/predefined-questions/match - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}