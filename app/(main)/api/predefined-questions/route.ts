import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Input validation schemas
const predefinedQuestionCreateSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format'),
  question: z.string()
    .min(1, "Question is required")
    .max(500, "Question too long")
    .trim(),
  // Optional answer; if omitted or empty, AI will handle the question
  answer: z.string()
    .max(2000, "Answer too long")
    .trim()
    .optional(),
  is_active: z.boolean().default(true),
  is_site_wide: z.boolean().default(false),
  priority: z.number()
    .min(0, "Priority must be non-negative")
    .max(100, "Priority too high")
    .default(50),
  // Optional URL rules for creation
  url_rules: z.array(z.object({
    rule_type: z.enum(['exact','contains','exclude']),
    pattern: z.string().min(1, 'Pattern is required').max(500, 'Pattern too long'),
    is_active: z.boolean().optional().default(true)
  })).optional().default([])
});

// Helper function to get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// Helper function to create error response
function createErrorResponse(message: string, status: number = 500) {
  const response = NextResponse.json({ error: message }, { status });
  return addCorsHeaders(response);
}

// Helper function to create success response
function createSuccessResponse(data: unknown, message?: string, status: number = 200) {
  const response = NextResponse.json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  }, { status });
  return addCorsHeaders(response);
}

// GET /api/predefined-questions - Fetch predefined questions for a site
export async function GET(request: NextRequest) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const search = searchParams.get('search');
    const is_active = searchParams.get('is_active');
    const is_site_wide = searchParams.get('is_site_wide');

    if (!siteId) {
      return createErrorResponse('Site ID is required', 400);
    }

    // Validate UUID format
    try {
      z.string().uuid().parse(siteId);
    } catch {
      return createErrorResponse('Invalid site ID format', 400);
    }

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      console.error('Site ownership verification failed:', siteError);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    // Build query with filters
    let query = supabase
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
      .eq('site_id', siteId);

    // Apply filters
    if (search) {
      query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
    }
    
    if (is_active !== null && is_active !== '') {
      query = query.eq('is_active', is_active === 'true');
    }
    
    if (is_site_wide !== null && is_site_wide !== '') {
      query = query.eq('is_site_wide', is_site_wide === 'true');
    }

    // Get total count for pagination
    const { count } = await supabase
      .from('predefined_questions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId);

    // Apply pagination and ordering
    const { data: questions, error } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      console.error('Predefined questions fetch error:', error);
      return createErrorResponse('Failed to fetch predefined questions');
    }

    const response = {
      questions: questions || [],
      total: count || 0,
      page,
      limit
    };

    return createSuccessResponse(response, 'Predefined questions fetched successfully');

  } catch (error) {
    console.error('GET /api/predefined-questions error:', error);
    return createErrorResponse('Internal server error');
  }
}

// POST /api/predefined-questions - Create new predefined question
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

    const validation = predefinedQuestionCreateSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ');
      return createErrorResponse(errorMessage, 400);
    }

    const questionData = validation.data;
    
    // Get Supabase client
    const supabase = getSupabaseClient();

    // Verify site ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('id', questionData.siteId)
      .eq('user_id', userId)
      .single();

    if (siteError || !site) {
      console.error('Site ownership verification failed:', siteError);
      return createErrorResponse('Site not found or unauthorized', 404);
    }

    // Create the predefined question
    const { data: newQuestion, error: createError } = await supabase
      .from('predefined_questions')
      .insert([{
        site_id: questionData.siteId,
        question: questionData.question,
        answer: (questionData.answer && questionData.answer.trim()) ? questionData.answer : null,
        priority: questionData.priority,
        is_site_wide: questionData.is_site_wide,
        is_active: questionData.is_active
      }])
      .select('id, site_id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
      .single();

    if (createError) {
      console.error('Predefined question creation error:', createError);
      return createErrorResponse('Failed to create predefined question');
    }

    // If URL rules are provided, insert them now
    if (questionData.url_rules && questionData.url_rules.length > 0) {
      const rulesToInsert = questionData.url_rules.map(rule => ({
        question_id: newQuestion.id,
        rule_type: rule.rule_type,
        pattern: rule.pattern,
        is_active: rule.is_active ?? true
      }));
      const { error: rulesError } = await supabase
        .from('question_url_rules')
        .insert(rulesToInsert);
      if (rulesError) {
        console.error('Failed to create URL rules for predefined question:', rulesError);
        return createErrorResponse('Failed to create URL rules');
      }
    }

    // Fetch the created question with rules for response
    const { data: createdWithRules, error: fetchError } = await supabase
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
      .eq('id', newQuestion.id)
      .single();

    if (fetchError || !createdWithRules) {
      console.warn('Created question fetched without rules due to error:', fetchError);
    }

    // Invalidate cache gracefully (don't fail if cache is unavailable)
    try {
      const { cache, getCacheKey } = await import('@/lib/cache');
      const cacheKey = getCacheKey(questionData.siteId, 'predefined_questions');
      await cache.del(cacheKey);
      // Also invalidate match caches for this site
      await cache.invalidatePattern?.(`chat:${questionData.siteId}:question_match_*`);
      // Bump site cache version so all readers get fresh keys
      await cache.bumpSiteVersion(questionData.siteId);
      console.log(`🗑️ Cache invalidated for predefined questions and matches: ${questionData.siteId}`);
    } catch (cacheError) {
      console.warn(`⚠️ Cache invalidation failed for site ${questionData.siteId}:`, cacheError);
      // Continue execution - cache failure shouldn't break the API
    }

    return createSuccessResponse(createdWithRules || newQuestion, 'Predefined question created successfully', 201);

  } catch (error) {
    console.error('POST /api/predefined-questions error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/predefined-questions - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}
