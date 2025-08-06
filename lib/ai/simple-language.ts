import { detectLanguage as baseDetectLanguage } from './language';

export interface CachedLanguageResult {
  name: string;
  code: string;
  confidence: number;
  detectedAt: number;
  messageCount: number;
  preferredLanguage?: string;
}

// Simple in-memory cache to replace Redis (for development)
// In production, this could be replaced with a proper session store
const sessionLanguageCache = new Map<string, CachedLanguageResult>();

/**
 * Redis-free language detection with simple session memory
 * Provides the same interface as the original but without Redis dependencies
 */
export async function detectLanguageWithoutRedis(
  sessionId: string,
  message: string,
  preferredLanguage?: string
): Promise<CachedLanguageResult> {
  const cacheKey = `session:${sessionId}:language`;
  
  // Check in-memory cache first
  const cached = sessionLanguageCache.get(cacheKey);
  
  if (cached) {
    // Update message count and return cached result
    cached.messageCount += 1;
    sessionLanguageCache.set(cacheKey, cached);
    
    console.log(`🔄 Using cached language for session ${sessionId}: ${cached.name} (${cached.code}) [${cached.messageCount} msgs]`);
    return cached;
  }
  
  // No cache hit - detect language
  const detection = baseDetectLanguage(message, preferredLanguage);
  
  const result: CachedLanguageResult = {
    name: detection.name,
    code: detection.code,
    confidence: detection.confidence,
    detectedAt: Date.now(),
    messageCount: 1,
    preferredLanguage
  };
  
  // Store in simple in-memory cache
  sessionLanguageCache.set(cacheKey, result);
  
  console.log(`🔍 Detected new language for session ${sessionId}: ${result.name} (confidence: ${result.confidence})`);
  return result;
}

/**
 * Clean up old session data (called periodically to prevent memory leaks)
 */
export function cleanupOldLanguageSessions() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [key, value] of sessionLanguageCache.entries()) {
    if (now - value.detectedAt > maxAge) {
      sessionLanguageCache.delete(key);
    }
  }
}

// Auto-cleanup every 10 minutes
setInterval(cleanupOldLanguageSessions, 10 * 60 * 1000);