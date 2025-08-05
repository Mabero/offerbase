import { NextRequest, NextResponse } from 'next/server';

// Error categories for better classification
export enum ErrorCategory {
  CLIENT_ERROR = 'CLIENT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  siteId?: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  requestId?: string;
  duration?: number;
  additionalData?: Record<string, unknown>;
}

export interface StructuredError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: unknown;
  context: ErrorContext;
  timestamp: number;
  stack?: string;
  retryable: boolean;
  userMessage: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: ErrorCategory[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    ErrorCategory.EXTERNAL_SERVICE,
    ErrorCategory.NETWORK_ERROR,
    ErrorCategory.DATABASE_ERROR
  ]
};

class ErrorHandler {
  /**
   * Create a structured error with context
   */
  createError(
    error: unknown,
    category: ErrorCategory,
    context: ErrorContext = {},
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): StructuredError {
    const id = this.generateErrorId();
    const timestamp = Date.now();
    
    // Extract error message and stack
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Determine if error is retryable
    const retryable = this.isRetryable(category, error);
    
    // Create user-friendly message
    const userMessage = this.getUserMessage(category, severity);
    
    const structuredError: StructuredError = {
      id,
      category,
      severity,
      message,
      originalError: error,
      context: {
        ...context,
        requestId: context.requestId || id
      },
      timestamp,
      stack,
      retryable,
      userMessage
    };

    // Log the error
    this.logError(structuredError);
    
    return structuredError;
  }

  /**
   * Handle API errors with proper response formatting
   */
  handleAPIError(
    error: unknown,
    request: NextRequest,
    context: Partial<ErrorContext> = {}
  ): NextResponse {
    const fullContext: ErrorContext = {
      ...context,
      ip: this.getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      endpoint: request.nextUrl.pathname,
      method: request.method,
      requestId: request.headers.get('x-request-id') || this.generateErrorId()
    };

    // Categorize the error
    const category = this.categorizeError(error);
    const severity = this.determineSeverity(category, error);
    
    const structuredError = this.createError(error, category, fullContext, severity);
    
    // Determine HTTP status code
    const statusCode = this.getStatusCode(category);
    
    // Create response
    return NextResponse.json(
      {
        error: true,
        code: category,
        message: structuredError.userMessage,
        requestId: structuredError.id,
        timestamp: new Date(structuredError.timestamp).toISOString(),
        ...(process.env.NODE_ENV === 'development' && {
          details: structuredError.message,
          stack: structuredError.stack
        })
      },
      {
        status: statusCode,
        headers: {
          'X-Request-ID': structuredError.id,
          'X-Error-Category': category,
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        }
      }
    );
  }

  /**
   * Execute function with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: any;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const category = this.categorizeError(error);
        const retryable = retryConfig.retryableErrors.includes(category);
        
        // If not retryable or last attempt, throw error
        if (!retryable || attempt === retryConfig.maxAttempts) {
          throw this.createError(error, category, {
            ...context,
            attemptNumber: attempt,
            maxAttempts: retryConfig.maxAttempts
          });
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelayMs
        );
        
        console.warn(`🔄 Retrying operation (attempt ${attempt}/${retryConfig.maxAttempts}) after ${delay}ms:`, error.message);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Categorize error based on type and message
   */
  private categorizeError(error: unknown): ErrorCategory {
    if (!error) return ErrorCategory.SERVER_ERROR;
    
    const message = (error as Error).message?.toLowerCase() || '';
    const code = (error as { code?: string }).code?.toLowerCase() || '';
    
    // Check error types and messages
    if ((error as Error).name === 'ValidationError' || message.includes('validation')) {
      return ErrorCategory.VALIDATION_ERROR;
    }
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT_ERROR;
    }
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorCategory.AUTHENTICATION_ERROR;
    }
    
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return ErrorCategory.NETWORK_ERROR;
    }
    
    if (message.includes('openai') || message.includes('api key') || message.includes('external')) {
      return ErrorCategory.EXTERNAL_SERVICE;
    }
    
    if (message.includes('database') || message.includes('supabase') || code.startsWith('pg')) {
      return ErrorCategory.DATABASE_ERROR;
    }
    
    // Check HTTP status codes
    const status = (error as { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      return ErrorCategory.CLIENT_ERROR;
    }
    
    return ErrorCategory.SERVER_ERROR;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(category: ErrorCategory, error: unknown): ErrorSeverity {
    switch (category) {
      case ErrorCategory.CRITICAL:
        return ErrorSeverity.CRITICAL;
      
      case ErrorCategory.DATABASE_ERROR:
      case ErrorCategory.EXTERNAL_SERVICE:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.NETWORK_ERROR:
      case ErrorCategory.SERVER_ERROR:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.VALIDATION_ERROR:
      case ErrorCategory.CLIENT_ERROR:
      case ErrorCategory.AUTHENTICATION_ERROR:
      case ErrorCategory.RATE_LIMIT_ERROR:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(category: ErrorCategory, error: unknown): boolean {
    const retryableCategories = [
      ErrorCategory.EXTERNAL_SERVICE,
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.DATABASE_ERROR
    ];
    
    if (!retryableCategories.includes(category)) {
      return false;
    }
    
    // Don't retry authentication errors
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return false;
    }
    
    return true;
  }

  /**
   * Get HTTP status code for error category
   */
  private getStatusCode(category: ErrorCategory): number {
    switch (category) {
      case ErrorCategory.VALIDATION_ERROR:
      case ErrorCategory.CLIENT_ERROR:
        return 400;
      case ErrorCategory.AUTHENTICATION_ERROR:
        return 401;
      case ErrorCategory.RATE_LIMIT_ERROR:
        return 429;
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502;
      case ErrorCategory.NETWORK_ERROR:
      case ErrorCategory.DATABASE_ERROR:
      case ErrorCategory.SERVER_ERROR:
      default:
        return 500;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getUserMessage(category: ErrorCategory, severity: ErrorSeverity): string {
    const messages = {
      [ErrorCategory.CLIENT_ERROR]: 'Invalid request. Please check your input and try again.',
      [ErrorCategory.VALIDATION_ERROR]: 'Please check your input and try again.',
      [ErrorCategory.AUTHENTICATION_ERROR]: 'Authentication required. Please log in and try again.',
      [ErrorCategory.RATE_LIMIT_ERROR]: 'Too many requests. Please wait a moment and try again.',
      [ErrorCategory.EXTERNAL_SERVICE]: 'External service temporarily unavailable. Please try again in a few moments.',
      [ErrorCategory.DATABASE_ERROR]: 'Database temporarily unavailable. Please try again shortly.',
      [ErrorCategory.NETWORK_ERROR]: 'Network error occurred. Please check your connection and try again.',
      [ErrorCategory.SERVER_ERROR]: 'An unexpected error occurred. Our team has been notified.'
    };
    
    return messages[category] || messages[ErrorCategory.SERVER_ERROR];
  }

  /**
   * Log structured error
   */
  private logError(error: StructuredError): void {
    const logLevel = this.getLogLevel(error.severity);
    const logData = {
      id: error.id,
      category: error.category,
      severity: error.severity,
      message: error.message,
      context: error.context,
      timestamp: new Date(error.timestamp).toISOString(),
      retryable: error.retryable
    };

    // Use appropriate log level
    switch (logLevel) {
      case 'error':
        console.error(`❌ [${error.category}]`, logData);
        break;
      case 'warn':
        console.warn(`⚠️ [${error.category}]`, logData);
        break;
      case 'info':
        console.info(`ℹ️ [${error.category}]`, logData);
        break;
    }

    // In production, you might want to send to external monitoring service
    if (process.env.NODE_ENV === 'production' && error.severity === ErrorSeverity.CRITICAL) {
      // Example: Send to monitoring service
      // this.sendToMonitoring(error);
    }
  }

  /**
   * Get log level for severity
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get client IP address
   */
  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    return forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Convenience functions
export function createStructuredError(
  error: unknown,
  category: ErrorCategory,
  context: ErrorContext = {},
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): StructuredError {
  return errorHandler.createError(error, category, context, severity);
}

export function handleAPIError(
  error: unknown,
  request: NextRequest,
  context: Partial<ErrorContext> = {}
): NextResponse {
  return errorHandler.handleAPIError(error, request, context);
}

export function withRetry<T>(
  operation: () => Promise<T>,
  context: ErrorContext = {},
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return errorHandler.withRetry(operation, context, config);
}

// Error monitoring and health check utilities
export function getErrorStats(): {
  enabled: boolean;
  retryConfig: RetryConfig;
  categories: ErrorCategory[];
  severity: ErrorSeverity[];
} {
  return {
    enabled: true,
    retryConfig: DEFAULT_RETRY_CONFIG,
    categories: Object.values(ErrorCategory),
    severity: Object.values(ErrorSeverity)
  };
}