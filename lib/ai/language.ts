import { franc } from 'franc';

// Language code mapping for better user experience
const languageNames: Record<string, string> = {
  eng: 'English',
  nor: 'Norwegian',
  nno: 'Norwegian Nynorsk',
  nob: 'Norwegian Bokmål',
  swe: 'Swedish',
  dan: 'Danish',
  deu: 'German',
  fra: 'French',
  spa: 'Spanish',
  ita: 'Italian',
  por: 'Portuguese',
  nld: 'Dutch',
  fin: 'Finnish',
  pol: 'Polish',
  rus: 'Russian',
  tur: 'Turkish',
  arb: 'Arabic',
  zho: 'Chinese',
  jpn: 'Japanese',
  kor: 'Korean',
  hin: 'Hindi',
};

// Normalize Norwegian variants to a single code
const normalizeLanguageCode = (code: string): string => {
  if (['nor', 'nno', 'nob'].includes(code)) {
    return 'nor'; // Normalize all Norwegian variants to 'nor'
  }
  return code;
};

export interface LanguageDetectionResult {
  code: string;
  name: string;
  confidence: number;
  instruction: string;
}

/**
 * Detect the language of the input text
 * @param text The text to analyze
 * @returns Language detection result with code, name, and instruction
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  // Franc returns an ISO 639-3 code
  const detectedCode = franc(text, { minLength: 3 });
  
  // Handle unknown or undetermined languages
  if (detectedCode === 'und') {
    return {
      code: 'eng',
      name: 'English',
      confidence: 0.5,
      instruction: 'IMPORTANT: Respond in English.',
    };
  }

  // Normalize the language code
  const normalizedCode = normalizeLanguageCode(detectedCode);
  const languageName = languageNames[normalizedCode] || languageNames[detectedCode] || 'Unknown';
  
  // Calculate confidence based on text length and character variety
  const confidence = calculateConfidence(text, detectedCode);
  
  // Create the instruction for the AI
  const instruction = createLanguageInstruction(languageName, normalizedCode);
  
  return {
    code: normalizedCode,
    name: languageName,
    confidence,
    instruction,
  };
}

/**
 * Calculate confidence score for language detection
 */
function calculateConfidence(text: string, detectedCode: string): number {
  // Base confidence on text length
  const lengthScore = Math.min(text.length / 50, 1); // Max confidence at 50+ chars
  
  // Check for special characters that indicate certain languages
  const hasNordicChars = /[æøåÆØÅäöÄÖ]/.test(text);
  const hasAsianChars = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
  
  let confidence = lengthScore * 0.8; // Base confidence
  
  // Boost confidence for specific character matches
  if ((detectedCode === 'nor' || detectedCode === 'nno' || detectedCode === 'nob') && hasNordicChars) {
    confidence += 0.2;
  } else if ((detectedCode === 'zho' || detectedCode === 'jpn' || detectedCode === 'kor') && hasAsianChars) {
    confidence += 0.2;
  }
  
  return Math.min(confidence, 1); // Cap at 1.0
}

/**
 * Create a strong language instruction for the AI
 */
function createLanguageInstruction(languageName: string, languageCode: string): string {
  // Special handling for Norwegian to be more specific
  if (languageCode === 'nor') {
    return `CRITICAL INSTRUCTION: You MUST respond in Norwegian (Bokmål). This is mandatory. Do NOT respond in English or any other language. The user wrote in Norwegian, so your ENTIRE response must be in Norwegian.`;
  }
  
  // For other languages
  return `CRITICAL INSTRUCTION: You MUST respond in ${languageName}. This is mandatory. Do NOT respond in English or any other language. The user wrote in ${languageName}, so your ENTIRE response must be in ${languageName}.`;
}

/**
 * Prepend language instruction to user message
 */
export function enforceLanguageInMessage(userMessage: string, detectedLanguage: LanguageDetectionResult): string {
  // Only enforce if confidence is high enough
  if (detectedLanguage.confidence < 0.6) {
    return userMessage;
  }
  
  // Prepend language marker that the AI will recognize
  return `[Language: ${detectedLanguage.name}] ${userMessage}`;
}

/**
 * Add language enforcement to system prompt
 */
export function addLanguageToSystemPrompt(systemPrompt: string, detectedLanguage: LanguageDetectionResult): string {
  // Only add if confidence is high enough
  if (detectedLanguage.confidence < 0.6) {
    return systemPrompt;
  }
  
  // Add the language instruction at the beginning AND end for maximum effect
  return `${detectedLanguage.instruction}\n\n${systemPrompt}\n\n${detectedLanguage.instruction}`;
}