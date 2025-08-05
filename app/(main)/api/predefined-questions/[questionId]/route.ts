import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { predefinedQuestionSchema, sanitizeString, sanitizeHtml, sanitizePattern } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { z } from 'zod';

// Question ID parameter validation
const questionIdParamSchema = z.object({
  questionId: z.string().uuid('Invalid question ID format')
});

// Update schema - all fields optional
const updateQuestionSchema = predefinedQuestionSchema.partial().omit({ siteId: true }).extend({
  url_rules: z.array(z.object({
    id: z.string().uuid().optional(),
    rule_type: z.enum(['contains', 'exact', 'exclude']),
    pattern: z.string().min(1).max(200).trim(),
    is_active: z.boolean().default(true),
    _delete: z.boolean().optional()
  })).optional()
});

// GET /api/predefined-questions/[questionId] - Fetch single predefined question
export const GET = createAPIRoute(
  {
    requireAuth: true,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { supabase, userId, request } = context;
    const { questionId } = await (request as NextRequest & { params: { questionId: string } }).params;

    // Validate questionId parameter
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid question ID format', 400);
    }

    // Fetch question with ownership verification and retry logic
    const question = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
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
            sites!inner (
              id,
              user_id
            ),
            question_url_rules (
              id,
              rule_type,
              pattern,
              is_active,
              created_at,
              updated_at
            )
          `)
          .eq('id', questionId)
          .eq('sites.user_id', userId!)
          .single();

        if (error || !data) {
          throw new Error('Question not found or unauthorized');
        }

        // Remove the sites relation from the response
        const { sites, ...questionData } = data;
        return questionData;
      },
      { operation: 'fetchPredefinedQuestion', questionId, userId }
    );

    return createSuccessResponse(question, 'Predefined question fetched successfully');
  }
);

// PUT /api/predefined-questions/[questionId] - Update predefined question
export const PUT = createAPIRoute(
  {
    requireAuth: true,
    bodySchema: updateQuestionSchema,
    allowedMethods: ['PUT']
  },
  async (context) => {
    const { body, supabase, userId, request } = context;
    const { questionId } = await (request as NextRequest & { params: { questionId: string } }).params;
    const updateData = body as z.infer<typeof updateQuestionSchema>;

    // Validate questionId parameter
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid question ID format', 400);
    }

    // First verify ownership and get site_id
    const { siteId } = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('predefined_questions')
          .select(`
            site_id,
            sites!inner (
              id,
              user_id
            )
          `)
          .eq('id', questionId)
          .eq('sites.user_id', userId!)
          .single();

        if (error || !data) {
          throw new Error('Question not found or unauthorized');
        }
        return { siteId: data.site_id };
      },
      { operation: 'verifyQuestionOwnership', questionId, userId }
    );

    // Sanitize user-generated content
    const sanitizedData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (updateData.question !== undefined) {
      sanitizedData.question = sanitizeString(updateData.question);
    }
    if (updateData.answer !== undefined) {
      sanitizedData.answer = updateData.answer ? sanitizeHtml(updateData.answer) : null;
    }
    if (updateData.priority !== undefined) sanitizedData.priority = updateData.priority;
    if (updateData.is_site_wide !== undefined) sanitizedData.is_site_wide = updateData.is_site_wide;
    if (updateData.is_active !== undefined) sanitizedData.is_active = updateData.is_active;

    // Update the question
    const updatedQuestion = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('predefined_questions')
          .update(sanitizedData)
          .eq('id', questionId)
          .select('id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'updatePredefinedQuestion', questionId, siteId, userId }
    );

    // Handle URL rules updates if provided
    let urlRules: Array<{
      id: string;
      rule_type: string;
      pattern: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> = [];
    if (updateData.url_rules) {
      try {
        urlRules = await executeDBOperation(
          async () => {
            // Get existing rules
            const { data: existingRules } = await supabase
              .from('question_url_rules')
              .select('id')
              .eq('question_id', questionId);

            const existingRuleIds = new Set(existingRules?.map(r => r.id) || []);

            // Process rules updates
            const rulesToCreate = [];
            const rulesToUpdate = [];
            const rulesToDelete = [];

            for (const rule of updateData.url_rules!) {
              if (rule._delete) {
                if (rule.id) {
                  rulesToDelete.push(rule.id);
                }
              } else if (rule.id && existingRuleIds.has(rule.id)) {
                // Update existing rule
                rulesToUpdate.push({
                  id: rule.id,
                  rule_type: rule.rule_type,
                  pattern: sanitizePattern(rule.pattern),
                  is_active: rule.is_active,
                  updated_at: new Date().toISOString()
                });
              } else {
                // Create new rule
                rulesToCreate.push({
                  question_id: questionId,
                  rule_type: rule.rule_type,
                  pattern: sanitizePattern(rule.pattern),
                  is_active: rule.is_active
                });
              }
            }

            // Execute rule operations
            if (rulesToDelete.length > 0) {
              await supabase
                .from('question_url_rules')
                .delete()
                .in('id', rulesToDelete);
            }

            if (rulesToCreate.length > 0) {
              await supabase
                .from('question_url_rules')
                .insert(rulesToCreate);
            }

            // Update rules one by one
            for (const rule of rulesToUpdate) {
              const { id, ...updateRuleData } = rule;
              await supabase
                .from('question_url_rules')
                .update(updateRuleData)
                .eq('id', id);
            }

            // Get all current rules after updates
            const { data: currentRules, error } = await supabase
              .from('question_url_rules')
              .select('id, rule_type, pattern, is_active, created_at, updated_at')
              .eq('question_id', questionId);

            if (error) throw error;
            return currentRules || [];
          },
          { operation: 'updateUrlRules', questionId, siteId, userId }
        );
      } catch (error) {
        console.error('Error updating URL rules:', error);
        // Don't fail the entire request, but note the issue
        urlRules = [];
      }
    } else {
      // If no rules update provided, fetch existing rules
      urlRules = await executeDBOperation(
        async () => {
          const { data, error } = await supabase
            .from('question_url_rules')
            .select('id, rule_type, pattern, is_active, created_at, updated_at')
            .eq('question_id', questionId);

          if (error) throw error;
          return data || [];
        },
        { operation: 'fetchExistingUrlRules', questionId }
      );
    }

    const questionWithRules = {
      ...updatedQuestion,
      question_url_rules: urlRules
    };

    // Invalidate cache
    const cachePattern = getCacheKey(siteId, 'predefined_questions*');
    await cache.del(cachePattern);
    console.log(`🗑️ Cache invalidated for predefined questions: ${siteId}`);

    return createSuccessResponse(questionWithRules, 'Predefined question updated successfully');
  }
);

// DELETE /api/predefined-questions/[questionId] - Delete predefined question
export const DELETE = createAPIRoute(
  {
    requireAuth: true,
    allowedMethods: ['DELETE']
  },
  async (context) => {
    const { supabase, userId, request } = context;
    const { questionId } = await (request as NextRequest & { params: { questionId: string } }).params;

    // Validate questionId parameter
    const paramValidation = questionIdParamSchema.safeParse({ questionId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid question ID format', 400);
    }

    // First verify ownership and get site_id
    const { siteId } = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('predefined_questions')
          .select(`
            site_id,
            sites!inner (
              id,
              user_id
            )
          `)
          .eq('id', questionId)
          .eq('sites.user_id', userId!)
          .single();

        if (error || !data) {
          throw new Error('Question not found or unauthorized');
        }
        return { siteId: data.site_id };
      },
      { operation: 'verifyQuestionOwnership', questionId, userId }
    );

    // Delete the question (URL rules will be deleted automatically due to CASCADE)
    await executeDBOperation(
      async () => {
        const { error } = await supabase
          .from('predefined_questions')
          .delete()
          .eq('id', questionId);

        if (error) throw error;
      },
      { operation: 'deletePredefinedQuestion', questionId, siteId, userId }
    );

    // Invalidate cache
    const cachePattern = getCacheKey(siteId, 'predefined_questions*');
    await cache.del(cachePattern);
    console.log(`🗑️ Cache invalidated for predefined questions: ${siteId}`);

    return createSuccessResponse(null, 'Predefined question deleted successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();