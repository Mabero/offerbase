import { NextRequest } from 'next/server';
import { createAPIRoute, createSuccessResponse, executeDBOperation, createOptionsHandler } from '@/lib/api-template';
import { batchSummarizeTrainingMaterials } from '@/lib/ai/summarizer';
import { z } from 'zod';

// Site ID parameter validation
const siteIdParamSchema = z.object({
  siteId: z.string().uuid('Invalid site ID format')
});

// POST /api/sites/[siteId]/summarize-materials - Start batch summarization
export const POST = createAPIRoute(
  {
    requireAuth: true,
    requireSiteOwnership: true,
    allowedMethods: ['POST'],
    rateLimitType: 'api' // Higher rate limits for AI operations
  },
  async (context) => {
    const { supabase, userId, request, siteId } = context;

    // Validate siteId parameter
    const { siteId: paramSiteId } = await (request as NextRequest & { params: { siteId: string } }).params;
    const paramValidation = siteIdParamSchema.safeParse({ siteId: paramSiteId });
    if (!paramValidation.success) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('Invalid site ID format', 400);
    }

    // Check if there are materials to summarize
    const materialsCount = await executeDBOperation(
      async () => {
        const { count, error } = await supabase
          .from('training_materials')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', paramSiteId)
          .eq('scrape_status', 'success');

        if (error) throw error;
        return count || 0;
      },
      { operation: 'countTrainingMaterials', siteId: paramSiteId, userId }
    );

    if (materialsCount === 0) {
      const { createValidationErrorResponse } = await import('@/lib/validation');
      return createValidationErrorResponse('No training materials available for summarization', 404);
    }

    // Start summarization process in background
    batchSummarizeTrainingMaterials(paramSiteId).catch(error => {
      console.error('Background summarization error:', error);
    });

    return createSuccessResponse(
      { materialsCount, siteId: paramSiteId },
      `Summarization started for ${materialsCount} training materials`,
      202 // Accepted - processing in background
    );
  }
);

// OPTIONS handler for CORS
export const OPTIONS = createOptionsHandler();