import { Redis } from '@upstash/redis';
import IORedis from 'ioredis';

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  CHAT_SETTINGS: 1800,     // 30 minutes
  AFFILIATE_LINKS: 300,    // 5 minutes  
  TRAINING_MATERIALS: 600, // 10 minutes
  LANGUAGE_DETECTION: 300, // 5 minutes
  CONTEXT_SELECTION: 300,  // 5 minutes
} as const;

// Cache key generators
export const getCacheKey = (siteId: string, type: string, suffix?: string) => {
  const base = `chat:${siteId}:${type}`;
  return suffix ? `${base}:${suffix}` : base;
};

export const getSessionKey = (sessionId: string, type: string) => 
  `session:${sessionId}:${type}`;

// Redis client setup with fallback
class CacheClient {
  private client: Redis | IORedis | null = null;
  private isConnected = false;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    // Skip Redis initialization in development unless explicitly enabled
    if (process.env.NODE_ENV === 'development' && !process.env.ENABLE_REDIS_DEV) {
      console.log('⚠️ Cache: Redis disabled in development mode');
      this.isConnected = false;
      return;
    }

    try {
      // Try Upstash Redis first (for production)
      if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        this.client = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        console.log('✅ Cache: Connected to Upstash Redis');
        this.isConnected = true;
      }
      // Fallback to local Redis (for development)
      else if (process.env.REDIS_URL) {
        this.client = new IORedis(process.env.REDIS_URL);
        
        // Test connection
        await this.client.ping();
        console.log('✅ Cache: Connected to local Redis');
        this.isConnected = true;
      } else {
        console.log('⚠️ Cache: No Redis configuration found, caching disabled');
        this.isConnected = false;
      }
    } catch (error) {
      console.log('⚠️ Cache: Redis connection failed, falling back to no caching');
      this.isConnected = false;
      this.client = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const result = await this.client.get(key);
      if (!result) return null;
      
      // Handle both string and parsed object responses
      if (typeof result === 'string') {
        return JSON.parse(result);
      }
      return result as T;
    } catch (error) {
      console.warn(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const serialized = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      console.warn(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string | string[]): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    
    try {
      if (Array.isArray(key)) {
        await this.client.del(...key);
      } else {
        await this.client.del(key);
      }
      return true;
    } catch (error) {
      console.warn(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      console.warn(`Cache EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  // Invalidate cache patterns (useful for site-wide cache clearing)
  async invalidatePattern(pattern: string): Promise<boolean> {
    if (!this.isConnected || !this.client) return false;
    
    try {
      // For IORedis, use scan + del
      if (this.client instanceof IORedis) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      }
      // For Upstash, we need to track keys manually or use different approach
      else {
        console.warn('Pattern invalidation not fully supported with Upstash REST API');
      }
      return true;
    } catch (error) {
      console.warn(`Cache pattern invalidation error for ${pattern}:`, error);
      return false;
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      client: this.client ? 'redis' : 'none'
    };
  }

  // Site cache version helpers (for invalidation without KEYS/SCAN)
  async getSiteVersion(siteId: string): Promise<number> {
    if (!this.isConnected || !this.client) return 1;
    const key = `chat:${siteId}:cache_version`;
    try {
      const raw = await this.client.get(key as any);
      if (!raw) return 1;
      const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch (error) {
      console.warn(`Cache getSiteVersion error for site ${siteId}:`, error);
      return 1;
    }
  }

  async bumpSiteVersion(siteId: string): Promise<number> {
    if (!this.isConnected || !this.client) return 1;
    const key = `chat:${siteId}:cache_version`;
    try {
      // @ts-ignore - both clients support INCR
      const v = await (this.client as any).incr(key);
      return typeof v === 'number' ? v : parseInt(String(v), 10) || 1;
    } catch (error) {
      console.warn(`Cache bumpSiteVersion error for site ${siteId}:`, error);
      return 1;
    }
  }
}

// Export singleton instance
export const cache = new CacheClient();

// Helper functions for common cache operations
export async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds?: number
): Promise<T> {
  // Try cache first
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch fresh data
  const freshData = await fetchFn();
  
  // Cache the result (don't await to avoid blocking)
  cache.set(key, freshData, ttlSeconds).catch(error => 
    console.warn(`Failed to cache data for key ${key}:`, error)
  );
  
  return freshData;
}

// Batch cache operations
export async function getCachedBatch<T>(
  keys: string[],
  fetchFn: (missingKeys: string[]) => Promise<Record<string, T>>,
  ttlSeconds?: number
): Promise<Record<string, T>> {
  const results: Record<string, T> = {};
  const missingKeys: string[] = [];

  // Check cache for all keys
  for (const key of keys) {
    const cached = await cache.get<T>(key);
    if (cached !== null) {
      results[key] = cached;
    } else {
      missingKeys.push(key);
    }
  }

  // Fetch missing data
  if (missingKeys.length > 0) {
    const freshData = await fetchFn(missingKeys);
    
    // Cache fresh data and add to results
    for (const [key, value] of Object.entries(freshData)) {
      results[key] = value;
      cache.set(key, value, ttlSeconds).catch(error =>
        console.warn(`Failed to cache batch data for key ${key}:`, error)
      );
    }
  }

  return results;
}
