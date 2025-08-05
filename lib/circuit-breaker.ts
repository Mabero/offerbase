import { cache } from './cache';

// Circuit breaker configuration
export const CIRCUIT_BREAKER_CONFIG = {
  // Number of failures before opening circuit
  FAILURE_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
  
  // Time to wait before allowing test requests (in milliseconds)
  RESET_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '30000'),
  
  // Timeout for individual requests (in milliseconds)
  REQUEST_TIMEOUT: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'),
  
  // Minimum number of requests before considering failure rate
  MIN_REQUESTS: 3,
  
  // Success rate threshold to close circuit (0-1)
  SUCCESS_RATE_THRESHOLD: 0.5
} as const;

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  totalRequests: number;
}

export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  circuitState: CircuitState;
  fallbackUsed: boolean;
}

class CircuitBreaker {
  private serviceName: string;
  private cacheKey: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.cacheKey = `circuit_breaker:${serviceName}`;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<CircuitBreakerResult<T>> {
    const state = await this.getState();
    const now = Date.now();

    // Check if circuit should be opened based on failure rate
    if (state.state === CircuitState.CLOSED && this.shouldOpenCircuit(state)) {
      await this.openCircuit(state, now);
      state.state = CircuitState.OPEN;
    }

    // If circuit is open, check if we should try half-open
    if (state.state === CircuitState.OPEN && now >= state.nextAttemptTime) {
      await this.transitionToHalfOpen(state);
      state.state = CircuitState.HALF_OPEN;
    }

    // If circuit is open and not ready for retry, fail fast
    if (state.state === CircuitState.OPEN) {
      const retryIn = Math.ceil((state.nextAttemptTime - now) / 1000);
      console.warn(`🔴 Circuit breaker OPEN for ${this.serviceName}. Retry in ${retryIn}s`);
      
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          return {
            success: true,
            data: fallbackResult,
            circuitState: state.state,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          return {
            success: false,
            error: `Service unavailable and fallback failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
            circuitState: state.state,
            fallbackUsed: true
          };
        }
      }

      return {
        success: false,
        error: `Service temporarily unavailable. Circuit breaker is OPEN. Retry in ${retryIn} seconds.`,
        circuitState: state.state,
        fallbackUsed: false
      };
    }

    // Execute the operation with timeout
    try {
      const result = await this.executeWithTimeout(operation, CIRCUIT_BREAKER_CONFIG.REQUEST_TIMEOUT);
      
      // Record success
      await this.recordSuccess(state);
      
      // If we were in half-open state and succeeded, close the circuit
      if (state.state === CircuitState.HALF_OPEN) {
        await this.closeCircuit(state);
        console.log(`🟢 Circuit breaker CLOSED for ${this.serviceName}`);
      }

      return {
        success: true,
        data: result,
        circuitState: CircuitState.CLOSED,
        fallbackUsed: false
      };

    } catch (error) {
      // Record failure
      await this.recordFailure(state, now);
      
      console.error(`❌ Circuit breaker recorded failure for ${this.serviceName}:`, error);

      // Try fallback if available
      if (fallback) {
        try {
          const fallbackResult = await fallback();
          return {
            success: true,
            data: fallbackResult,
            circuitState: state.state,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          console.error(`Fallback also failed for ${this.serviceName}:`, fallbackError);
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        circuitState: state.state,
        fallbackUsed: false
      };
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  /**
   * Get current circuit breaker state
   */
  private async getState(): Promise<CircuitBreakerState> {
    const cached = await cache.get<CircuitBreakerState>(this.cacheKey);
    
    return cached || {
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      totalRequests: 0
    };
  }

  /**
   * Save circuit breaker state
   */
  private async saveState(state: CircuitBreakerState): Promise<void> {
    // Cache for 1 hour
    await cache.set(this.cacheKey, state, 3600);
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(state: CircuitBreakerState): boolean {
    if (state.totalRequests < CIRCUIT_BREAKER_CONFIG.MIN_REQUESTS) {
      return false;
    }

    const failureRate = state.failureCount / state.totalRequests;
    return failureRate > (1 - CIRCUIT_BREAKER_CONFIG.SUCCESS_RATE_THRESHOLD);
  }

  /**
   * Open the circuit
   */
  private async openCircuit(state: CircuitBreakerState, now: number): Promise<void> {
    state.state = CircuitState.OPEN;
    state.nextAttemptTime = now + CIRCUIT_BREAKER_CONFIG.RESET_TIMEOUT;
    await this.saveState(state);
    
    console.warn(`🔴 Circuit breaker OPENED for ${this.serviceName}. Next attempt at ${new Date(state.nextAttemptTime).toISOString()}`);
  }

  /**
   * Transition to half-open state
   */
  private async transitionToHalfOpen(state: CircuitBreakerState): Promise<void> {
    state.state = CircuitState.HALF_OPEN;
    // Reset counters for half-open testing
    state.failureCount = 0;
    state.successCount = 0;
    state.totalRequests = 0;
    await this.saveState(state);
    
    console.log(`🟡 Circuit breaker HALF-OPEN for ${this.serviceName}`);
  }

  /**
   * Close the circuit
   */
  private async closeCircuit(state: CircuitBreakerState): Promise<void> {
    state.state = CircuitState.CLOSED;
    state.failureCount = 0;
    state.successCount = 0;
    state.totalRequests = 0;
    state.lastFailureTime = 0;
    state.nextAttemptTime = 0;
    await this.saveState(state);
  }

  /**
   * Record a successful operation
   */
  private async recordSuccess(state: CircuitBreakerState): Promise<void> {
    state.successCount++;
    state.totalRequests++;
    
    // Reset failure count on success (helps with recovery)
    if (state.failureCount > 0) {
      state.failureCount = Math.max(0, state.failureCount - 1);
    }
    
    await this.saveState(state);
  }

  /**
   * Record a failed operation
   */
  private async recordFailure(state: CircuitBreakerState, now: number): Promise<void> {
    state.failureCount++;
    state.totalRequests++;
    state.lastFailureTime = now;
    await this.saveState(state);
  }

  /**
   * Get circuit breaker status for monitoring
   */
  async getStatus() {
    const state = await this.getState();
    const now = Date.now();
    
    return {
      serviceName: this.serviceName,
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
      totalRequests: state.totalRequests,
      failureRate: state.totalRequests > 0 ? state.failureCount / state.totalRequests : 0,
      lastFailureTime: state.lastFailureTime ? new Date(state.lastFailureTime).toISOString() : null,
      nextAttemptTime: state.nextAttemptTime ? new Date(state.nextAttemptTime).toISOString() : null,
      timeUntilRetry: state.state === CircuitState.OPEN ? Math.max(0, state.nextAttemptTime - now) : null
    };
  }

  /**
   * Manually reset circuit breaker (for admin operations)
   */
  async reset(): Promise<void> {
    const state: CircuitBreakerState = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
      totalRequests: 0
    };
    
    await this.saveState(state);
    console.log(`🔄 Circuit breaker RESET for ${this.serviceName}`);
  }
}

// Pre-configured circuit breakers for common services
export const openAICircuitBreaker = new CircuitBreaker('openai');
export const supabaseCircuitBreaker = new CircuitBreaker('supabase');
export const scrapingCircuitBreaker = new CircuitBreaker('scraping');

// Utility function to create fallback responses for OpenAI
export function createOpenAIFallback() {
  return async () => {
    // Return a safe fallback response when OpenAI is down
    return {
      type: 'message',
      message: 'I apologize, but I\'m experiencing some technical difficulties right now. Please try again in a few moments, or contact support if the issue persists.'
    };
  };
}

// Utility function to create fallback responses for scraping
export function createScrapingFallback(url: string) {
  return async () => {
    // Return a basic fallback when scraping fails
    return {
      success: true,
      content: `Unable to scrape content from ${url}. Please check the URL and try again later.`,
      metadata: {
        title: url,
        description: 'Content scraping temporarily unavailable'
      }
    };
  };
}

// Health check function for all circuit breakers
export async function getCircuitBreakerHealth() {
  const [openAIStatus, supabaseStatus, scrapingStatus] = await Promise.all([
    openAICircuitBreaker.getStatus(),
    supabaseCircuitBreaker.getStatus(),
    scrapingCircuitBreaker.getStatus()
  ]);

  return {
    timestamp: new Date().toISOString(),
    services: {
      openai: openAIStatus,
      supabase: supabaseStatus,
      scraping: scrapingStatus
    },
    overall: {
      healthy: openAIStatus.state !== CircuitState.OPEN && 
               supabaseStatus.state !== CircuitState.OPEN && 
               scrapingStatus.state !== CircuitState.OPEN,
      degraded: openAIStatus.state === CircuitState.HALF_OPEN || 
                supabaseStatus.state === CircuitState.HALF_OPEN ||
                scrapingStatus.state === CircuitState.HALF_OPEN
    }
  };
}