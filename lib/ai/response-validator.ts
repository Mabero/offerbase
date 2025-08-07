/**
 * Minimal AI Response Validation - Just Structure Check
 * AI handles content validation through self-correction
 */

import { StructuredAIResponse } from '@/types/training';

interface ValidationResult {
  isValid: boolean;
  sanitizedResponse: StructuredAIResponse;
}

/**
 * Minimal validation - just ensure required fields exist
 * Trust AI to provide appropriate content
 */
export function validateAIResponse(
  response: StructuredAIResponse
): ValidationResult {
  // Only check that message exists - trust AI for content quality
  const isValid = !!(response.message && typeof response.message === 'string' && response.message.trim().length > 0);

  // Pass through all fields with minimal sanitization
  const sanitizedResponse: StructuredAIResponse = {
    message: response.message?.trim() || '',
    show_simple_link: response.show_simple_link || false,
    link_text: response.link_text || '',
    link_url: response.link_url || '',
    products: response.products || undefined
  };

  return {
    isValid,
    sanitizedResponse
  };
}

// Legacy export for backward compatibility  
export class AIResponseValidator {
  validate(response: StructuredAIResponse): ValidationResult {
    return validateAIResponse(response);
  }
}