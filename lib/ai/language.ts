import { franc } from 'franc';

// Curated list of languages for preferred language setting
// Focused on major European languages, high-economy countries, and large populations
export const PREFERRED_LANGUAGE_OPTIONS = [
  { code: 'eng', name: 'English', flag: '🇺🇸' },
  { code: 'nor', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'dan', name: 'Danish', flag: '🇩🇰' },
  { code: 'swe', name: 'Swedish', flag: '🇸🇪' },
  { code: 'fin', name: 'Finnish', flag: '🇫🇮' },
  { code: 'deu', name: 'German', flag: '🇩🇪' },
  { code: 'fra', name: 'French', flag: '🇫🇷' },
  { code: 'spa', name: 'Spanish', flag: '🇪🇸' },
  { code: 'ita', name: 'Italian', flag: '🇮🇹' },
  { code: 'nld', name: 'Dutch', flag: '🇳🇱' },
  { code: 'por', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'pol', name: 'Polish', flag: '🇵🇱' },
  { code: 'rus', name: 'Russian', flag: '🇷🇺' },
  { code: 'zho', name: 'Chinese (Mandarin)', flag: '🇨🇳' },
  { code: 'jpn', name: 'Japanese', flag: '🇯🇵' },
  { code: 'kor', name: 'Korean', flag: '🇰🇷' },
  { code: 'arb', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hin', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tur', name: 'Turkish', flag: '🇹🇷' },
];

// Language code mapping for better user experience
const languageNames: Record<string, string> = {
  eng: 'English',
  en: 'English',
  nor: 'Norwegian',
  no: 'Norwegian',
  nno: 'Norwegian Nynorsk',
  nob: 'Norwegian Bokmål',
  swe: 'Swedish',
  sv: 'Swedish',
  dan: 'Danish',
  da: 'Danish',
  deu: 'German',
  de: 'German',
  fra: 'French',
  fr: 'French',
  spa: 'Spanish',
  es: 'Spanish',
  ita: 'Italian',
  it: 'Italian',
  por: 'Portuguese',
  pt: 'Portuguese',
  nld: 'Dutch',
  nl: 'Dutch',
  fin: 'Finnish',
  fi: 'Finnish',
  pol: 'Polish',
  pl: 'Polish',
  rus: 'Russian',
  ru: 'Russian',
  tur: 'Turkish',
  tr: 'Turkish',
  arb: 'Arabic',
  ar: 'Arabic',
  zho: 'Chinese',
  zh: 'Chinese',
  jpn: 'Japanese',
  ja: 'Japanese',
  kor: 'Korean',
  ko: 'Korean',
  hin: 'Hindi',
  hi: 'Hindi',
};


export interface LanguageDetectionResult {
  code: string;
  name: string;
  confidence: number;
  instruction: string;
}

/**
 * Detect the language of the input text using franc
 * @param text The text to analyze
 * @param preferredLanguage Optional preferred language code to use as fallback
 * @returns Language detection result with code, name, and instruction
 */
export function detectLanguage(text: string, preferredLanguage?: string | null): LanguageDetectionResult {
  // Clean text for better detection
  const cleanedText = cleanTextForDetection(text);
  
  // If text is too short or mostly non-linguistic, default to English
  if (cleanedText.length < 3) {
    return {
      code: 'eng',
      name: 'English',
      confidence: 0.5,
      instruction: 'You must respond in English.',
    };
  }

  // Use franc for language detection
  const detectedCode = franc(cleanedText);
  
  // If franc can't detect (returns 'und'), use preferred language or default to English
  if (detectedCode === 'und') {
    if (preferredLanguage) {
      const fallbackLanguageName = languageNames[preferredLanguage] || 'Unknown';
      return {
        code: preferredLanguage,
        name: fallbackLanguageName,
        confidence: 0.7, // Moderate confidence for preferred language fallback
        instruction: `You must respond in ${fallbackLanguageName}.`,
      };
    }
    return {
      code: 'eng',
      name: 'English',
      confidence: 0.5,
      instruction: 'You must respond in English.',
    };
  }
  
  // Get language name
  const languageName = languageNames[detectedCode] || 'Unknown';
  
  // Simple confidence based on text length
  const confidence = Math.min(cleanedText.length / 20, 1) * 0.9;
  
  // If confidence is low and we have a preferred language, use it instead
  if (confidence < 0.6 && preferredLanguage) {
    const fallbackLanguageName = languageNames[preferredLanguage] || 'Unknown';
    return {
      code: preferredLanguage,
      name: fallbackLanguageName,
      confidence: 0.7, // Moderate confidence for preferred language fallback
      instruction: `You must respond in ${fallbackLanguageName}.`,
    };
  }
  
  // Create simple instruction
  const instruction = `You must respond in ${languageName}.`;
  
  return {
    code: detectedCode,
    name: languageName,
    confidence,
    instruction,
  };
}

/**
 * Clean text for better language detection
 */
function cleanTextForDetection(text: string): string {
  return text
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/gi, '')
    // Remove email addresses
    .replace(/[\w.-]+@[\w.-]+\.[\w]+/gi, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
}


/**
 * Prepend language instruction to user message
 */
export function enforceLanguageInMessage(userMessage: string, detectedLanguage: LanguageDetectionResult): string {
  // Only enforce if confidence is reasonable
  if (detectedLanguage.confidence < 0.3) {
    return userMessage;
  }
  
  return `[Language: ${detectedLanguage.name}] ${userMessage}`;
}

/**
 * Add language enforcement to system prompt
 */
export function addLanguageToSystemPrompt(systemPrompt: string, detectedLanguage: LanguageDetectionResult): string {
  // Only add if confidence is reasonable
  if (detectedLanguage.confidence < 0.3) {
    return systemPrompt;
  }
  
  // Add simple language instruction to system prompt
  return `${detectedLanguage.instruction}\n\n${systemPrompt}`;
}

/**
 * Detect language with context (simplified - just uses detectLanguage with preferred language)
 */
export function detectLanguageWithContext(
  text: string,
  conversationHistory: { role: string; content: string }[] = [],
  sessionLanguage: { code: string; confidence: number } | null = null,
  preferredLanguage?: string | null
): LanguageDetectionResult {
  // Just use the simple detection with preferred language fallback
  return detectLanguage(text, preferredLanguage);
}
