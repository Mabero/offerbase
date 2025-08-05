import { cache } from './cache';
import { NextRequest } from 'next/server';

// Rate limiting configuration
export const RATE_LIMITS = {
  // Chat API limits
  CHAT_PER_IP: {
    requests: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_HOUR || '100'),
    window: 60 * 60, // 1 hour in seconds
    burst: parseInt(process.env.RATE_LIMIT_BURST_SIZE || '10') // Burst allowance for short-term spikes
  },
  
  // Per-site limits to prevent single site abuse
  CHAT_PER_SITE: {
    requests: 1000, // Higher limit per site
    window: 60 * 60, // 1 hour in seconds
    burst: 50
  },
  
  // Authenticated users get higher limits
  CHAT_AUTHENTICATED: {
    requests: 500,
    window: 60 * 60, // 1 hour in seconds
    burst: 25
  },
  
  // General API limits
  API_PER_IP: {
    requests: 200,
    window: 60 * 60, // 1 hour in seconds
    burst: 20
  }
} as const;

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  requests: number;
  window: number; // in seconds
  burst: number;
}

class RateLimiter {
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.RATE_LIMIT_ENABLED?.toLowerCase() === 'true';
  }

  /**
   * Check if request is within rate limits using sliding window with burst allowance
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig,
    identifier?: string
  ): Promise<RateLimitResult> {
    // If rate limiting is disabled, always allow
    if (!this.isEnabled) {
      return {
        success: true,
        limit: config.requests,
        remaining: config.requests,
        reset: Date.now() + (config.window * 1000)
      };
    }

    const now = Date.now();
    const windowStart = now - (config.window * 1000);
    
    try {
      // Get current request count and timestamps
      const currentData = await cache.get<{
        count: number;
        timestamps: number[];
        burstUsed: number;
        windowStart: number;
      }>(key);

      let count = 0;
      let timestamps: number[] = [];
      let burstUsed = 0;
      let storedWindowStart = windowStart;

      if (currentData) {
        // Clean old timestamps outside current window
        timestamps = currentData.timestamps.filter(ts => ts > windowStart);
        count = timestamps.length;
        burstUsed = currentData.burstUsed || 0;
        storedWindowStart = currentData.windowStart;
      }

      // Reset burst if we're in a new window
      if (storedWindowStart < windowStart) {
        burstUsed = 0;
        storedWindowStart = windowStart;
      }

      // Check if within regular limits
      const withinRegularLimit = count < config.requests;
      const withinBurstLimit = burstUsed < config.burst;

      let success = false;
      let remaining = Math.max(0, config.requests - count);
      
      if (withinRegularLimit) {
        success = true;
      } else if (withinBurstLimit) {
        // Allow burst usage
        success = true;
        burstUsed++;
        remaining = Math.max(0, config.burst - burstUsed);
      }

      if (success) {
        // Add current timestamp and update cache
        timestamps.push(now);
        const newData = {
          count: timestamps.length,
          timestamps,
          burstUsed,
          windowStart: storedWindowStart
        };

        // Set TTL to window duration + buffer
        await cache.set(key, newData, config.window + 60);
      }

      const reset = now + (config.window * 1000);
      const retryAfter = success ? undefined : Math.ceil(config.window / 60); // in minutes

      if (!success && identifier) {
        console.warn(`🚫 Rate limit exceeded for ${identifier}:`, {
          key: key.replace(/:/g, '_'), // Safe logging
          count,
          limit: config.requests,
          burstUsed,
          burstLimit: config.burst
        });
      }

      return {
        success,
        limit: config.requests,
        remaining,
        reset,
        retryAfter
      };

    } catch (error) {
      console.error('Rate limiting error:', error);
      // On error, allow request but log the issue
      return {
        success: true,
        limit: config.requests,
        remaining: config.requests,
        reset: now + (config.window * 1000)
      };
    }
  }

  /**
   * Check rate limit for chat API
   */
  async checkChatRateLimit(
    request: NextRequest,
    siteId: string,
    userId?: string
  ): Promise<RateLimitResult> {
    const ip = this.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Create rate limit keys
    const ipKey = `rate_limit:chat:ip:${ip}`;
    const siteKey = `rate_limit:chat:site:${siteId}`;
    const userKey = userId ? `rate_limit:chat:user:${userId}` : null;

    // Determine which limits to apply
    const limits = [];
    
    // Always check IP limit
    limits.push({
      key: ipKey,
      config: userId ? RATE_LIMITS.CHAT_AUTHENTICATED : RATE_LIMITS.CHAT_PER_IP,
      identifier: `IP:${ip}`
    });
    
    // Check site limit
    limits.push({
      key: siteKey,
      config: RATE_LIMITS.CHAT_PER_SITE,
      identifier: `Site:${siteId}`
    });

    // Check all limits - fail if any limit is exceeded
    for (const { key, config, identifier } of limits) {
      const result = await this.checkRateLimit(key, config, identifier);
      if (!result.success) {
        return result; // Return first failed limit
      }
    }

    // All checks passed - return success with most restrictive remaining count
    const ipResult = await this.checkRateLimit(ipKey, userId ? RATE_LIMITS.CHAT_AUTHENTICATED : RATE_LIMITS.CHAT_PER_IP);
    return ipResult;
  }

  /**
   * Check rate limit for general API endpoints
   */
  async checkAPIRateLimit(request: NextRequest): Promise<RateLimitResult> {
    const ip = this.getClientIP(request);
    const key = `rate_limit:api:ip:${ip}`;
    
    return this.checkRateLimit(key, RATE_LIMITS.API_PER_IP, `API:${ip}`);
  }

  /**
   * Get client IP with fallbacks
   */
  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const remoteAddr = request.headers.get('x-forwarded-for')?.split(',')[0];
    
    return (forwarded?.split(',')[0]?.trim() || 
            realIp || 
            remoteAddr ||
            'unknown').replace(/[^a-zA-Z0-9.:]/g, ''); // Sanitize IP for key safety
  }

  /**
   * Create rate limit response headers
   */
  createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.reset.toString()
    };

    if (result.retryAfter) {
      headers['Retry-After'] = result.retryAfter.toString();
    }

    return headers;
  }

  /**
   * Get rate limit status for monitoring
   */
  async getRateLimitStatus(request: NextRequest, siteId?: string) {
    const ip = this.getClientIP(request);
    const keys = [
      `rate_limit:chat:ip:${ip}`,
      `rate_limit:api:ip:${ip}`
    ];
    
    if (siteId) {
      keys.push(`rate_limit:chat:site:${siteId}`);
    }

    const statuses = [];
    for (const key of keys) {
      const data = await cache.get(key);
      statuses.push({
        key: key.replace(/:/g, '_'), // Safe for logging
        data: data ? { count: data.count, burstUsed: data.burstUsed } : null
      });
    }

    return {
      enabled: this.isEnabled,
      ip,
      statuses
    };
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Utility function for creating rate limit error responses
export function createRateLimitResponse(result: RateLimitResult) {
  const headers = rateLimiter.createRateLimitHeaders(result);
  
  return Response.json(
    {
      error: "Rate Limit Exceeded",
      message: `Too many requests. Try again in ${result.retryAfter} minutes.`,
      limit: result.limit,
      remaining: result.remaining,
      reset: new Date(result.reset).toISOString()
    },
    {
      status: 429,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    }
  );
}

// Helper for middleware integration
export async function applyRateLimit(
  request: NextRequest,
  type: 'chat' | 'api' = 'api',
  siteId?: string,
  userId?: string
): Promise<{ allowed: boolean; result: RateLimitResult }> {
  let result: RateLimitResult;
  
  if (type === 'chat' && siteId) {
    result = await rateLimiter.checkChatRateLimit(request, siteId, userId);
  } else {
    result = await rateLimiter.checkAPIRateLimit(request);
  }
  
  return {
    allowed: result.success,
    result
  };
}