import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/lib/supabase-server';
import { handleAPIError, withRetry } from '@/lib/error-handling';
import { rateLimiter, createRateLimitResponse } from '@/lib/rate-limiting';
import { validateRequest, createValidationErrorResponse } from '@/lib/validation';
import { z } from 'zod';

/**
 * Standard API route template with all Phase 2 security features
 * 
 * Features included:
 * - Rate limiting
 * - Input validation with Zod
 * - Structured error handling
 * - Database retry logic  
 * - Performance logging
 * - CORS headers
 * - Authentication checks
 */

export interface APIRouteConfig {
  // Rate limiting configuration
  rateLimitType?: 'api' | 'authenticated' | 'admin';
  requireAuth?: boolean;
  requireSiteOwnership?: boolean;
  
  // Validation
  bodySchema?: z.ZodSchema;
  querySchema?: z.ZodSchema;
  
  // Caching
  enableCaching?: boolean;
  cacheTTL?: number;
  
  // Custom settings
  allowedMethods?: string[];
  customHeaders?: Record<string, string>;
}

export interface APIContext {
  userId?: string;
  siteId?: string;
  request: NextRequest;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  body?: unknown;
  query?: unknown;
  startTime: number;
}

/**
 * Standard API route wrapper with all security features
 */
export function createAPIRoute(
  config: APIRouteConfig,
  handler: (context: APIContext) => Promise<NextResponse>
) {
  return async function(request: NextRequest) {
    const startTime = Date.now();
    let userId: string | undefined;
    let siteId: string | undefined;
    
    try {
      // 1. Check allowed methods
      if (config.allowedMethods && !config.allowedMethods.includes(request.method)) {
        return NextResponse.json(
          { error: 'Method not allowed' },
          { 
            status: 405,
            headers: {
              'Allow': config.allowedMethods.join(', '),
              'Access-Control-Allow-Origin': '*',
            }
          }
        );
      }

      // 2. Apply rate limiting
      const rateLimitResult = await rateLimiter.checkAPIRateLimit(request);
      if (!rateLimitResult.success) {
        return createRateLimitResponse(rateLimitResult);
      }

      // 3. Authentication if required
      if (config.requireAuth !== false) {
        const { userId: authUserId } = await auth();
        if (!authUserId) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { 
              status: 401,
              headers: {
                'Access-Control-Allow-Origin': '*',
              }
            }
          );
        }
        userId = authUserId;
      }

      // 4. Parse and validate request body
      let body: unknown;
      let query: unknown;
      
      if (request.method !== 'GET' && config.bodySchema) {
        try {
          body = await request.json();
          const validation = validateRequest(config.bodySchema, body);
          if (!validation.success) {
            return createValidationErrorResponse(validation.error);
          }
          body = validation.data;
        } catch (error) {
          return createValidationErrorResponse('Invalid JSON in request body');
        }
      }

      // 5. Validate query parameters
      if (config.querySchema) {
        const { searchParams } = new URL(request.url);
        const queryObj = Object.fromEntries(searchParams.entries());
        const validation = validateRequest(config.querySchema, queryObj);
        if (!validation.success) {
          return createValidationErrorResponse(validation.error);
        }
        query = validation.data;
      }

      // 6. Initialize Supabase with retry logic
      const supabase = createSupabaseAdminClient();

      // 7. Site ownership verification if required
      if (config.requireSiteOwnership && userId) {
        siteId = (query as Record<string, unknown>)?.siteId as string || (body as Record<string, unknown>)?.siteId as string;
        if (!siteId) {
          return createValidationErrorResponse('Site ID is required');
        }

        // Verify site ownership with retry logic
        await withRetry(
          async () => {
            const { data: site, error } = await supabase
              .from('sites')
              .select('id')
              .eq('id', siteId!)
              .eq('user_id', userId!)
              .single();

            if (error || !site) {
              throw new Error('Site not found or unauthorized');
            }
          },
          { operation: 'verifySiteOwnership', siteId, userId }
        );
      }

      // 8. Create API context
      const context: APIContext = {
        userId,
        siteId,
        request,
        supabase,
        body,
        query,
        startTime
      };

      // 9. Execute handler with error handling
      const response = await handler(context);

      // 10. Add rate limit headers to successful responses
      const rateLimitHeaders = rateLimiter.createRateLimitHeaders(rateLimitResult);
      
      // 11. Add standard headers
      const headers = new Headers(response.headers);
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // Add custom headers
      if (config.customHeaders) {
        Object.entries(config.customHeaders).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }

      // 12. Performance logging
      const duration = Date.now() - startTime;
      const isSlowResponse = duration > 1000;
      
      console.log(`${isSlowResponse ? '🐌' : '⚡'} API ${request.method} ${request.nextUrl.pathname}: ${duration}ms`);

      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });

    } catch (error) {
      // Use structured error handling
      return handleAPIError(error, request, {
        userId: userId || undefined,
        siteId: siteId || undefined,
        endpoint: request.nextUrl.pathname,
        duration: Date.now() - startTime
      });
    }
  };
}

/**
 * Helper function for database operations with retry logic
 */
export async function executeDBOperation<T>(
  operation: () => Promise<T>,
  context: Pick<APIContext, 'siteId' | 'userId'> & { operation: string; [key: string]: unknown }
): Promise<T> {
  return withRetry(operation, {
    operation: context.operation,
    siteId: context.siteId,
    userId: context.userId
  });
}

/**
 * Helper function to create standardized success responses
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  }, { status });
}

/**
 * Helper function to create paginated responses
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  }
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    pagination,
    timestamp: new Date().toISOString()
  });
}

/**
 * Standard OPTIONS handler for CORS
 */
export function createOptionsHandler() {
  return function OPTIONS() {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400',
      },
    });
  };
}