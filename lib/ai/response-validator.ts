/**
 * AI Response Validation Layer
 * Validates and sanitizes AI responses before processing
 */

import { StructuredAIResponse } from '@/types/training';

interface ValidationResult {
  isValid: boolean;
  sanitizedResponse?: StructuredAIResponse;
  errors: string[];
  warnings: string[];
}

interface AIResponse {
  message?: string;
  specific_products?: string[] | string;
  links?: Array<{
    url: string;
    name: string;
    description: string;
    image_url?: string;
    button_text?: string;
  }>;
  // Make it compatible with StructuredAIResponse
  [key: string]: unknown;
}

interface AffiliateLink {
  id: string;
  url: string;
  title: string;
  description: string | null;
  product_id: string | null;
  aliases: string[] | null;
  image_url: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Validates and sanitizes AI responses
 */
export class AIResponseValidator {
  private affiliateLinks: AffiliateLink[];
  
  constructor(affiliateLinks: AffiliateLink[] = []) {
    this.affiliateLinks = affiliateLinks;
  }

  /**
   * Validate and sanitize an AI response
   */
  validate(response: AIResponse | StructuredAIResponse): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic structure validation
    if (!response || typeof response !== 'object') {
      errors.push('Response must be a valid object');
      return { isValid: false, errors, warnings };
    }

    // Required fields validation
    if (!response.message || typeof response.message !== 'string') {
      errors.push('Response must have a valid message string');
    }

    if (typeof response.show_products !== 'boolean') {
      // Try to infer from other fields
      response.show_products = Boolean(
        (response.specific_products && response.specific_products.length > 0) ||
        ('links' in response && response.links && Array.isArray(response.links))
      );
      warnings.push('show_products field missing, inferred from other fields');
    }

    // Sanitize and validate specific_products
    if (response.specific_products) {
      if (!Array.isArray(response.specific_products)) {
        warnings.push('specific_products should be an array, converting to array');
        response.specific_products = [response.specific_products].filter(Boolean);
      } else {
        // Remove empty/invalid entries
        response.specific_products = response.specific_products
          .filter((product: unknown) => product && typeof product === 'string' && product.trim().length > 0)
          .map((product: string) => product.trim());
      }
    }

    // Validate max_products
    if (response.max_products !== undefined && response.max_products !== null) {
      const maxProducts = parseInt(String(response.max_products));
      if (isNaN(maxProducts) || maxProducts < 1 || maxProducts > 10) {
        warnings.push('max_products should be between 1-10, defaulting to 1');
        response.max_products = 1;
      } else {
        response.max_products = maxProducts;
      }
    }

    // Validate simple link fields
    if (response.show_simple_link) {
      if (response.link_text && typeof response.link_text !== 'string') {
        warnings.push('link_text should be a string');
        response.link_text = String(response.link_text || '').trim();
      }
      
      if (response.link_url && typeof response.link_url !== 'string') {
        warnings.push('link_url should be a string');
        response.link_url = String(response.link_url || '').trim();
      }
    }

    // Validate product references against available products
    this.validateProductReferences(response, warnings);

    // Sanitize message content
    response.message = this.sanitizeMessage(response.message);

    // Create sanitized response
    const sanitizedResponse: StructuredAIResponse = {
      message: response.message || '',
      show_products: Boolean(response.show_products),
      show_simple_link: Boolean(response.show_simple_link),
      link_text: (typeof response.link_text === 'string') ? response.link_text : undefined,
      link_url: (typeof response.link_url === 'string') ? response.link_url : undefined,
      specific_products: Array.isArray(response.specific_products) ? response.specific_products : undefined,
      max_products: (typeof response.max_products === 'number') ? response.max_products : undefined,
      product_context: (typeof response.product_context === 'string') ? response.product_context : undefined,
      is_relevant: response.is_relevant !== undefined ? Boolean(response.is_relevant) : true,
      relevance_score: (typeof response.relevance_score === 'number') ? Math.max(0, Math.min(1, response.relevance_score)) : 1.0,
      relevance_reason: (typeof response.relevance_reason === 'string') ? response.relevance_reason : undefined
    };

    console.log('🔍 Response Validation:', {
      isValid: errors.length === 0,
      errors: errors.length,
      warnings: warnings.length,
      hasSpecificProducts: Boolean(sanitizedResponse.specific_products?.length),
      showProducts: sanitizedResponse.show_products,
      showSimpleLink: sanitizedResponse.show_simple_link
    });

    return {
      isValid: errors.length === 0,
      sanitizedResponse,
      errors,
      warnings
    };
  }

  /**
   * Validate that mentioned products actually exist in the affiliate links
   */
  private validateProductReferences(response: AIResponse | StructuredAIResponse, warnings: string[]): void {
    if (!response.specific_products || !Array.isArray(response.specific_products)) {
      return;
    }

    if (this.affiliateLinks.length === 0) {
      warnings.push('No affiliate links available to validate product references');
      return;
    }

    const availableProductNames = this.affiliateLinks.flatMap(link => [
      link.title,
      link.product_id,
      ...(link.aliases || [])
    ]).filter((name): name is string => Boolean(name));

    const invalidProducts: string[] = [];
    const validProducts: string[] = [];

    for (const productName of response.specific_products) {
      // Check for exact matches (case-insensitive)
      const hasMatch = availableProductNames.some(availableName => 
        availableName.toLowerCase() === productName.toLowerCase()
      );

      if (hasMatch) {
        validProducts.push(productName);
      } else {
        // Check for partial matches
        const partialMatch = availableProductNames.find(availableName => 
          availableName.toLowerCase().includes(productName.toLowerCase()) ||
          productName.toLowerCase().includes(availableName.toLowerCase())
        );

        if (partialMatch) {
          warnings.push(`Product "${productName}" may be referencing "${partialMatch}"`);
          validProducts.push(productName);
        } else {
          invalidProducts.push(productName);
        }
      }
    }

    if (invalidProducts.length > 0) {
      warnings.push(`Unknown products mentioned: ${invalidProducts.join(', ')}. Available products: ${availableProductNames.slice(0, 5).join(', ')}${availableProductNames.length > 5 ? '...' : ''}`);
    }

    if (validProducts.length > 0) {
      console.log('✅ Valid product references found:', validProducts);
    }
  }

  /**
   * Sanitize the message content
   */
  private sanitizeMessage(message: string | undefined): string {
    if (!message || typeof message !== 'string') {
      return '';
    }

    return message
      .trim()
      .replace(/\n\s*\n/g, '\n') // Remove multiple newlines
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .slice(0, 2000);           // Limit length
  }

  /**
   * Check if response format is consistent with intentions
   */
  validateConsistency(response: StructuredAIResponse): string[] {
    const inconsistencies: string[] = [];

    // Check if products are mentioned but show_products is false
    if (!response.show_products && response.specific_products && response.specific_products.length > 0) {
      inconsistencies.push('Products specified but show_products is false');
    }

    // Check if show_products is true but no specific products mentioned
    if (response.show_products && (!response.specific_products || response.specific_products.length === 0)) {
      inconsistencies.push('show_products is true but no specific products mentioned (will use contextual matching)');
    }

    // Check if simple link is requested but no link text/URL provided
    if (response.show_simple_link && !response.link_text) {
      inconsistencies.push('Simple link requested but no link_text provided');
    }

    // Check for both product boxes and simple links (which is valid but worth noting)
    if (response.show_products && response.show_simple_link) {
      inconsistencies.push('Both product boxes and simple link requested (this is valid but ensure it\'s intentional)');
    }

    return inconsistencies;
  }
}

/**
 * Convenience function to validate AI responses
 */
export function validateAIResponse(
  response: AIResponse | StructuredAIResponse, 
  affiliateLinks: AffiliateLink[] = []
): ValidationResult {
  const validator = new AIResponseValidator(affiliateLinks);
  const validationResult = validator.validate(response);
  
  // Check consistency if validation passed
  if (validationResult.isValid && validationResult.sanitizedResponse) {
    const inconsistencies = validator.validateConsistency(validationResult.sanitizedResponse);
    validationResult.warnings.push(...inconsistencies);
  }
  
  return validationResult;
}