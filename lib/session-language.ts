import { cache, getCacheKey } from './cache';
import { detectLanguage as baseDetectLanguage } from './ai/language';

// Session language cache configuration
const SESSION_LANGUAGE_TTL = 300; // 5 minutes in seconds

export interface CachedLanguageResult {
  name: string;
  code: string;
  confidence: number;
  detectedAt: number;
  messageCount: number;
  preferredLanguage?: string;
}

export interface SessionLanguageManager {
  getLanguage(sessionId: string, message: string, preferredLanguage?: string): Promise<CachedLanguageResult>;
  updateLanguageConfidence(sessionId: string, correct: boolean): Promise<void>;
  clearSessionLanguage(sessionId: string): Promise<void>;
  getSessionLanguageStats(sessionId: string): Promise<CachedLanguageResult | null>;
}

class SessionLanguageCache implements SessionLanguageManager {
  
  /**
   * Get language for session with caching
   */
  async getLanguage(
    sessionId: string, 
    message: string, 
    preferredLanguage?: string
  ): Promise<CachedLanguageResult> {
    const cacheKey = getCacheKey(sessionId, 'session_language');
    
    // Try to get cached language first
    const cached = await cache.get<CachedLanguageResult>(cacheKey);
    
    if (cached && this.shouldUseCachedLanguage(cached, message, preferredLanguage)) {
      // Update message count and refresh cache
      cached.messageCount++;
      await cache.set(cacheKey, cached, SESSION_LANGUAGE_TTL);
      
      console.log(`🎯 Using cached language for session ${sessionId}: ${cached.name} (${cached.messageCount} messages)`);
      return cached;
    }
    
    // No cache hit or cache expired - detect language
    const detectedLanguage = baseDetectLanguage(message, preferredLanguage);
    
    const result: CachedLanguageResult = {
      name: detectedLanguage.name,
      code: detectedLanguage.code,
      confidence: detectedLanguage.confidence,
      detectedAt: Date.now(),
      messageCount: 1,
      preferredLanguage
    };
    
    // Cache the result
    await cache.set(cacheKey, result, SESSION_LANGUAGE_TTL);
    
    console.log(`🔍 Detected new language for session ${sessionId}: ${result.name} (confidence: ${result.confidence})`);
    return result;
  }
  
  /**
   * Update language confidence based on user feedback or behavior
   */
  async updateLanguageConfidence(sessionId: string, correct: boolean): Promise<void> {
    const cacheKey = getCacheKey(sessionId, 'session_language');
    const cached = await cache.get<CachedLanguageResult>(cacheKey);
    
    if (!cached) return;
    
    // Adjust confidence based on feedback
    if (correct) {
      cached.confidence = Math.min(1.0, cached.confidence + 0.1);
    } else {
      cached.confidence = Math.max(0.1, cached.confidence - 0.2);
    }
    
    // Update cache
    await cache.set(cacheKey, cached, SESSION_LANGUAGE_TTL);
    
    console.log(`📊 Updated language confidence for session ${sessionId}: ${cached.confidence}`);
  }
  
  /**
   * Clear session language cache
   */
  async clearSessionLanguage(sessionId: string): Promise<void> {
    const cacheKey = getCacheKey(sessionId, 'session_language');
    await cache.del(cacheKey);
    
    console.log(`🗑️ Cleared language cache for session ${sessionId}`);
  }
  
  /**
   * Get session language statistics
   */
  async getSessionLanguageStats(sessionId: string): Promise<CachedLanguageResult | null> {
    const cacheKey = getCacheKey(sessionId, 'session_language');
    return await cache.get<CachedLanguageResult>(cacheKey);
  }
  
  /**
   * Determine if we should use cached language
   */
  private shouldUseCachedLanguage(
    cached: CachedLanguageResult, 
    message: string, 
    preferredLanguage?: string
  ): boolean {
    const now = Date.now();
    const cacheAge = now - cached.detectedAt;
    
    // Don't use cache if it's too old (beyond TTL)
    if (cacheAge > SESSION_LANGUAGE_TTL * 1000) {
      return false;
    }
    
    // Don't use cache if preferred language changed
    if (preferredLanguage !== cached.preferredLanguage) {
      console.log(`🔄 Preferred language changed from ${cached.preferredLanguage} to ${preferredLanguage}`);
      return false;
    }
    
    // Use cache if confidence is high
    if (cached.confidence >= 0.8) {
      return true;
    }
    
    // Use cache if we have enough messages and reasonable confidence
    if (cached.messageCount >= 3 && cached.confidence >= 0.6) {
      return true;
    }
    
    // For low confidence, occasionally re-detect to improve accuracy
    if (cached.confidence < 0.6 && cached.messageCount % 5 === 0) {
      console.log(`🔍 Re-detecting language due to low confidence: ${cached.confidence}`);
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
export const sessionLanguageManager = new SessionLanguageCache();

/**
 * Optimized language detection that uses session caching
 */
export async function detectLanguageWithCaching(
  sessionId: string,
  message: string,
  preferredLanguage?: string
): Promise<CachedLanguageResult> {
  if (!sessionId) {
    // Fallback to direct detection if no session
    const result = baseDetectLanguage(message, preferredLanguage);
    return {
      name: result.name,
      code: result.code,
      confidence: result.confidence,
      detectedAt: Date.now(),
      messageCount: 1,
      preferredLanguage
    };
  }
  
  return await sessionLanguageManager.getLanguage(sessionId, message, preferredLanguage);
}

/**
 * Create language context with session awareness
 */
export function buildSessionLanguageContext(
  languageResult: CachedLanguageResult,
  includeStats: boolean = false
): string {
  let context = `User is communicating in ${languageResult.name} (${languageResult.code}).`;
  
  if (languageResult.preferredLanguage && languageResult.code !== languageResult.preferredLanguage) {
    context += ` However, their preferred language is ${languageResult.preferredLanguage}.`;
  }
  
  if (includeStats && languageResult.messageCount > 1) {
    context += ` Language confidence: ${Math.round(languageResult.confidence * 100)}% based on ${languageResult.messageCount} messages.`;
  }
  
  return context;
}

/**
 * Bulk clear language cache for multiple sessions
 */
export async function clearMultipleSessionLanguages(sessionIds: string[]): Promise<void> {
  const promises = sessionIds.map(sessionId => 
    sessionLanguageManager.clearSessionLanguage(sessionId)
  );
  
  await Promise.all(promises);
  console.log(`🗑️ Cleared language cache for ${sessionIds.length} sessions`);
}

/**
 * Get language cache statistics for monitoring
 */
export async function getLanguageCacheStats(): Promise<{
  enabled: boolean;
  ttl: number;
  cacheHits?: number;
  cacheMisses?: number;
}> {
  return {
    enabled: true,
    ttl: SESSION_LANGUAGE_TTL,
    // Note: Redis doesn't provide built-in hit/miss stats
    // These would need to be tracked separately if needed
  };
}

/**
 * Language learning helper - improves detection over time
 */
export async function recordLanguageFeedback(
  sessionId: string,
  expectedLanguage: string,
  actuallyDetected: string
): Promise<void> {
  const correct = expectedLanguage === actuallyDetected;
  
  await sessionLanguageManager.updateLanguageConfidence(sessionId, correct);
  
  if (!correct) {
    console.log(`🔄 Language mismatch for session ${sessionId}: expected ${expectedLanguage}, got ${actuallyDetected}`);
  }
}