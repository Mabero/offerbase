/**
 * Centralized configuration for product display system
 * All values configurable via environment variables for easy tuning
 */

export interface ProductDisplayConfig {
  confidence: {
    threshold: number;
    marginThreshold: number;
  };
  display: {
    minWords: number;
    maxResults: number;
    showOnBrandMention: boolean;
  };
  ai: {
    enabled: boolean;
    model: string;
    temperature: number;
  };
  intent: {
    enabled: boolean;
    suppressTechnicalQueries: boolean;
  };
  debug: boolean;
}

export const productConfig: ProductDisplayConfig = {
  // Core thresholds for confidence scoring
  confidence: {
    threshold: parseFloat(process.env.PRODUCT_CONFIDENCE_THRESHOLD || '0.3'),
    marginThreshold: parseFloat(process.env.PRODUCT_MARGIN_THRESHOLD || '0.10'),
  },
  
  // Display rules and limits
  display: {
    minWords: parseInt(process.env.PRODUCT_MIN_WORDS || '1'),
    maxResults: parseInt(process.env.PRODUCT_MAX_RESULTS || '12'),
    showOnBrandMention: process.env.PRODUCT_SHOW_ON_BRAND !== 'false', // Default true
  },
  
  // AI filtering configuration
  ai: {
    enabled: process.env.ENABLE_AI_PRODUCT_FILTERING === 'true',
    model: process.env.AI_FILTER_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.AI_FILTER_TEMPERATURE || '0.1'),
  },
  
  // Intent detection settings
  intent: {
    enabled: process.env.ENABLE_INTENT_DETECTION !== 'false', // Default true
    suppressTechnicalQueries: process.env.SUPPRESS_TECHNICAL !== 'false', // Default true
  },
  
  // Debug mode for detailed logging
  debug: process.env.PRODUCT_DEBUG === 'true',
};

/**
 * Validation helper to ensure config is properly loaded
 */
export function validateProductConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (productConfig.confidence.threshold < 0 || productConfig.confidence.threshold > 1) {
    errors.push('PRODUCT_CONFIDENCE_THRESHOLD must be between 0 and 1');
  }

  if (productConfig.confidence.marginThreshold < 0 || productConfig.confidence.marginThreshold > 1) {
    errors.push('PRODUCT_MARGIN_THRESHOLD must be between 0 and 1');
  }

  if (productConfig.display.minWords < 0) {
    errors.push('PRODUCT_MIN_WORDS must be 0 or greater');
  }

  if (productConfig.display.maxResults < 1) {
    errors.push('PRODUCT_MAX_RESULTS must be 1 or greater');
  }

  if (productConfig.ai.temperature < 0 || productConfig.ai.temperature > 2) {
    errors.push('AI_FILTER_TEMPERATURE must be between 0 and 2');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper to log current configuration (useful for debugging)
 */
export function logProductConfig(): void {
  // Debug logging removed for production
}