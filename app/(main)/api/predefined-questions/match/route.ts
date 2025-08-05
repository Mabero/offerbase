import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { siteIdQuerySchema, sanitizeUrl } from '@/lib/validation';
import { getCacheKey, cache } from '@/lib/cache';
import { defaultUrlMatcher } from '@/lib/url-matcher';
import { z } from 'zod';

// Match query schema
const matchQuerySchema = siteIdQuerySchema.extend({
  pageUrl: z.string().url('Invalid page URL format'),
  maxResults: z.string().optional()
    .transform(val => val ? parseInt(val, 10) : 4)
    .refine(val => val > 0 && val <= 20, 'Max results must be between 1 and 20')
});

// GET /api/predefined-questions/match - Match questions to page URL (public endpoint for widget)
export const GET = createAPIRoute(
  {
    requireAuth: false, // Public endpoint for widget usage
    querySchema: matchQuerySchema,
    allowedMethods: ['GET']
  },
  async (context) => {
    const { query, supabase } = context;
    const { siteId, pageUrl, maxResults } = query as z.infer<typeof matchQuerySchema>;
    
    // Sanitize the page URL
    const sanitizedPageUrl = sanitizeUrl(pageUrl);
    
    // Build cache key based on site and page URL
    const cacheKey = getCacheKey(siteId, `question_match_${Buffer.from(sanitizedPageUrl).toString('base64')}_${maxResults}`);
    
    // Try to get from cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      return createSuccessResponse(cached, 'Question matches fetched from cache');
    }

    // Fetch active predefined questions with URL rules
    const allQuestions = await executeDBOperation(
      async () => {
        const { data, error } = await supabase
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

        if (error) throw error;
        return data || [];
      },
      { operation: 'fetchQuestionsForMatching', siteId }
    );

    // Filter questions based on URL matching
    const matchedQuestions = [];
    
    for (const question of allQuestions) {
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
              if (defaultUrlMatcher(sanitizedPageUrl, rule.rule_type, rule.pattern)) {
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
      total: allQuestions.length
    };

    // Cache for 10 minutes
    await cache.set(cacheKey, response, 600);

    return createSuccessResponse(response, 'Question matches found successfully');
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();