import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Input validation schemas
const questionIdParamSchema = z.object({
  questionId: z.string().uuid('Invalid question ID format')
});

const updateQuestionSchema = z.object({
  question: z.string()
    .min(1, "Question is required")
    .max(500, "Question too long")
    .trim()
    .optional(),
  // Optional answer; if empty or omitted, AI will handle it
  answer: z.string()
    .max(2000, "Answer too long")
    .trim()
    .optional(),
  is_active: z.boolean().optional(),
  is_site_wide: z.boolean().optional(),
  priority: z.number()
    .min(0, "Priority must be non-negative")
    .max(100, "Priority too high")
    .optional(),
  // URL rules updates
  url_rules: z.array(z.object({
    id: z.string().uuid().optional(),
    rule_type: z.enum(['exact','contains','exclude']),
    pattern: z.string().min(1, 'Pattern is required').max(500, 'Pattern too long'),
    is_active: z.boolean().optional(),
    _delete: z.boolean().optional()
  })).optional()
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

// GET /api/predefined-questions/[questionId] - Fetch single predefined question
export async function GET(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get and validate parameters
    const { questionId } = params;
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid question ID format', 400);
    }

    // Get Supabase client
    const supabase = getSupabaseClient();
    
    // Fetch question with ownership verification
    const { data: question, error } = await supabase
      .from('predefined_questions')
      .select(`
        id,
        question,
        answer,
        priority,
        is_site_wide,
        is_active,
        created_at,
        updated_at,
        site_id,
        question_url_rules (
          id,
          question_id,
          rule_type,
          pattern,
          is_active,
          created_at,
          updated_at
        ),
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (error || !question) {
      console.error('Predefined question fetch error:', error);
      return createErrorResponse('Question not found or unauthorized', 404);
    }

    // Remove the sites relation from the response
    const { sites, ...questionData } = question;

    return createSuccessResponse(questionData, 'Predefined question fetched successfully');

  } catch (error) {
    console.error('GET /api/predefined-questions/[questionId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// PUT /api/predefined-questions/[questionId] - Update predefined question
export async function PUT(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get and validate parameters
    const { questionId } = params;
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid question ID format', 400);
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return createErrorResponse('Invalid JSON in request body', 400);
    }

    const validation = updateQuestionSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.errors.map(e => e.message).join(', ');
      return createErrorResponse(errorMessage, 400);
    }

    const updateData = validation.data;
    
    // Get Supabase client
    const supabase = getSupabaseClient();

    // First verify ownership and get site_id
    const { data: existingQuestion, error: ownershipError } = await supabase
      .from('predefined_questions')
      .select(`
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (ownershipError || !existingQuestion) {
      console.error('Question ownership verification failed:', ownershipError);
      return createErrorResponse('Question not found or unauthorized', 404);
    }

    // Prepare update data
    const sanitizedData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (updateData.question !== undefined) {
      sanitizedData.question = updateData.question;
    }
    if (updateData.answer !== undefined) {
      sanitizedData.answer = (updateData.answer && updateData.answer.trim()) ? updateData.answer : null;
    }
    if (updateData.priority !== undefined) sanitizedData.priority = updateData.priority;
    if (updateData.is_site_wide !== undefined) sanitizedData.is_site_wide = updateData.is_site_wide;
    if (updateData.is_active !== undefined) sanitizedData.is_active = updateData.is_active;

    // Update the question
    const { data: updatedQuestion, error: updateError } = await supabase
      .from('predefined_questions')
      .update(sanitizedData)
      .eq('id', questionId)
      .select('id, site_id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Predefined question update error:', updateError);
      return createErrorResponse('Failed to update predefined question');
    }

    // If URL rules are provided, process inserts/updates/deletes
    if (updateData.url_rules && updateData.url_rules.length > 0) {
      const toInsert = updateData.url_rules.filter(r => !r.id && !r._delete).map(r => ({
        question_id: questionId,
        rule_type: r.rule_type,
        pattern: r.pattern,
        is_active: r.is_active ?? true
      }));
      const toUpsert = updateData.url_rules.filter(r => r.id && !r._delete).map(r => ({
        id: r.id!,
        question_id: questionId,
        rule_type: r.rule_type,
        pattern: r.pattern,
        is_active: r.is_active ?? true
      }));
      const toDelete = updateData.url_rules.filter(r => r.id && r._delete).map(r => r.id!);

      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('question_url_rules')
          .insert(toInsert);
        if (insertErr) {
          console.error('Failed to insert URL rules:', insertErr);
          return createErrorResponse('Failed to update URL rules');
        }
      }

      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase
          .from('question_url_rules')
          .upsert(toUpsert, { onConflict: 'id' });
        if (upsertErr) {
          console.error('Failed to upsert URL rules:', upsertErr);
          return createErrorResponse('Failed to update URL rules');
        }
      }

      if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase
          .from('question_url_rules')
          .delete()
          .in('id', toDelete);
        if (deleteErr) {
          console.error('Failed to delete URL rules:', deleteErr);
          return createErrorResponse('Failed to update URL rules');
        }
      }
    }

    // Fetch updated question with rules
    const { data: updatedWithRules, error: fetchError } = await supabase
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
      .eq('id', questionId)
      .single();

    if (fetchError) {
      console.warn('Updated question fetched without rules due to error:', fetchError);
    }

    // Invalidate cache gracefully (don't fail if cache is unavailable)
    try {
      const { cache, getCacheKey } = await import('@/lib/cache');
      const cacheKey = getCacheKey(existingQuestion.site_id, 'predefined_questions');
      await cache.del(cacheKey);
      await cache.invalidatePattern?.(`chat:${existingQuestion.site_id}:question_match_*`);
      console.log(`🗑️ Cache invalidated for predefined questions and matches: ${existingQuestion.site_id}`);
    } catch (cacheError) {
      console.warn(`⚠️ Cache invalidation failed for site ${existingQuestion.site_id}:`, cacheError);
      // Continue execution - cache failure shouldn't break the API
    }

    return createSuccessResponse(updatedWithRules || updatedQuestion, 'Predefined question updated successfully');

  } catch (error) {
    console.error('PUT /api/predefined-questions/[questionId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// DELETE /api/predefined-questions/[questionId] - Delete predefined question
export async function DELETE(
  request: NextRequest,
  { params }: { params: { questionId: string } }
) {
  try {
    // Get authentication
    const { userId } = await auth();
    if (!userId) {
      return createErrorResponse('Authentication required', 401);
    }

    // Get and validate parameters
    const { questionId } = params;
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid question ID format', 400);
    }

    // Get Supabase client
    const supabase = getSupabaseClient();

    // First verify ownership and get site_id
    const { data: existingQuestion, error: ownershipError } = await supabase
      .from('predefined_questions')
      .select(`
        site_id,
        sites!inner (
          id,
          user_id
        )
      `)
      .eq('id', questionId)
      .eq('sites.user_id', userId)
      .single();

    if (ownershipError || !existingQuestion) {
      console.error('Question ownership verification failed:', ownershipError);
      return createErrorResponse('Question not found or unauthorized', 404);
    }

    // Delete the question (related data will be deleted via CASCADE)
    console.log(`🗑️ Attempting to delete predefined question: ${questionId} for user: ${userId}`);
    
    const { error: deleteError } = await supabase
      .from('predefined_questions')
      .delete()
      .eq('id', questionId)
      ;

    if (deleteError) {
      console.error(`❌ Predefined question deletion error:`, deleteError);
      return createErrorResponse('Failed to delete predefined question');
    }
    
    console.log(`✅ Predefined question deleted successfully: ${questionId}`);

    // Invalidate cache gracefully (don't fail if cache is unavailable)
    try {
      const { cache, getCacheKey } = await import('@/lib/cache');
      const cacheKey = getCacheKey(existingQuestion.site_id, 'predefined_questions');
      await cache.del(cacheKey);
      await cache.invalidatePattern?.(`chat:${existingQuestion.site_id}:question_match_*`);
      console.log(`🗑️ Cache invalidated for predefined questions and matches: ${existingQuestion.site_id}`);
    } catch (cacheError) {
      console.warn(`⚠️ Cache invalidation failed for site ${existingQuestion.site_id}:`, cacheError);
      // Continue execution - cache failure shouldn't break the API
    }

    return createSuccessResponse(null, 'Predefined question deleted successfully');

  } catch (error) {
    console.error('DELETE /api/predefined-questions/[questionId] error:', error);
    return createErrorResponse('Internal server error');
  }
}

// OPTIONS /api/predefined-questions/[questionId] - CORS preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}
