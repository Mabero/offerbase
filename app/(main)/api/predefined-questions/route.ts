import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { predefinedQuestionSchema, siteIdQuerySchema, paginationQuerySchema, sanitizeString, sanitizeHtml, sanitizePattern } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { z } from 'zod';

// Enhanced predefined question schema with URL rules
const predefinedQuestionWithRulesSchema = predefinedQuestionSchema.extend({
  url_rules: z.array(z.object({
    rule_type: z.enum(['contains', 'exact', 'exclude']),
    pattern: z.string().min(1).max(200).trim(),
    is_active: z.boolean().default(true)
  })).optional().default([])
});

// Query parameters schema for GET requests
const questionsQuerySchema = siteIdQuerySchema.extend({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1)
    .refine(val => val > 0, 'Page must be positive'),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50)
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  search: z.string().optional(),
  is_active: z.string().optional(),
  is_site_wide: z.string().optional()
});

// GET /api/predefined-questions - Fetch predefined questions for a site
export const GET = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    querySchema: questionsQuerySchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { query, siteId, supabase } = context;
    const { page, limit, search, is_active, is_site_wide } = query as z.infer<typeof questionsQuerySchema>;
    
    // Build cache key based on query parameters
    const cacheKey = getCacheKey(siteId!, `predefined_questions_${page}_${limit}_${search || 'all'}_${is_active || 'all'}_${is_site_wide || 'all'}`);
    
    // Try to get from cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return createSuccessResponse(cached, 'Predefined questions fetched from cache');
    }

    // Fetch questions with retry logic
    const { questions, total } = await executeDBOperation(
      async () => {
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
          .eq('site_id', siteId!);

        // Apply filters
        if (search) {
          const sanitizedSearch = sanitizeString(search);
          query = query.or(`question.ilike.%${sanitizedSearch}%,answer.ilike.%${sanitizedSearch}%`);
        }
        
        if (is_active !== undefined && is_active !== '') {
          query = query.eq('is_active', is_active === 'true');
        }
        
        if (is_site_wide !== undefined && is_site_wide !== '') {
          query = query.eq('is_site_wide', is_site_wide === 'true');
        }

        // Get total count for pagination
        const { count } = await supabase
          .from('predefined_questions')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', siteId!);

        // Apply pagination and ordering
        const { data, error } = await query
          .order('priority', { ascending: false })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1);

        if (error) throw error;
        return { questions: data || [], total: count || 0 };
      },
      { operation: 'fetchPredefinedQuestions', siteId, userId: context.userId }
    );

    const response = {
      questions,
      total,
      page,
      limit
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    return createSuccessResponse(response, 'Predefined questions fetched successfully');
  }
);

// POST /api/predefined-questions - Create new predefined question
export const POST = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    bodySchema: predefinedQuestionWithRulesSchema,
    allowedMethods: ['POST']
  },
  async (context) => {
    const { body, siteId, supabase } = context;
    const questionData = body as z.infer<typeof predefinedQuestionWithRulesSchema>;

    // Sanitize user-generated content
    const sanitizedQuestion = sanitizeString(questionData.question);
    const sanitizedAnswer = questionData.answer ? sanitizeHtml(questionData.answer) : null;

    // Create the question with retry logic
    const newQuestion = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
          .from('predefined_questions')
          .insert([{
            site_id: siteId!,
            question: sanitizedQuestion,
            answer: sanitizedAnswer,
            priority: questionData.priority || 50,
            is_site_wide: questionData.is_site_wide,
            is_active: questionData.is_active
          }])
          .select('id, question, answer, priority, is_site_wide, is_active, created_at, updated_at')
          .single();

        if (error) throw error;
        return data;
      },
      { operation: 'createPredefinedQuestion', siteId, userId: context.userId }
    );

    // Create URL rules if provided
    let urlRules: Array<{
      id: string;
      rule_type: string;
      pattern: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> = [];
    if (questionData.url_rules && questionData.url_rules.length > 0) {
      try {
        urlRules = await executeDBOperation(
          async () => {
            const rulesData = questionData.url_rules!.map(rule => ({
              question_id: newQuestion.id,
              rule_type: rule.rule_type,
              pattern: sanitizePattern(rule.pattern),
              is_active: rule.is_active
            }));

            const { data, error } = await supabase
              .from('question_url_rules')
              .insert(rulesData)
              .select('id, question_id, rule_type, pattern, is_active, created_at, updated_at');

            if (error) throw error;
            return data || [];
          },
          { operation: 'createUrlRules', questionId: newQuestion.id, siteId, userId: context.userId }
        );
      } catch (error) {
        console.error('Error creating URL rules:', error);
        // Don't fail the entire request, but note the issue
        urlRules = [];
      }
    }

    const questionWithRules = {
      ...newQuestion,
      question_url_rules: urlRules
    };

    // Invalidate cache
    const cachePattern = getCacheKey(siteId!, 'predefined_questions*');
    await cache.del(cachePattern);
    console.log(`🗑️ Cache invalidated for predefined questions: ${siteId}`);

    return createSuccessResponse(questionWithRules, 'Predefined question created successfully', 201);
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();