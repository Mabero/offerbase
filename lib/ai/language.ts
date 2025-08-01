import { franc } from 'franc';
import * as tinyld from 'tinyld';
// Remove problematic language-detector for now
// import LanguageDetector from 'language-detector';

// Initialize language-detector
// const lngDetector = new LanguageDetector();

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

// Common ISO 639-1 to ISO 639-3 mapping
const iso1ToIso3: Record<string, string> = {
  en: 'eng',
  no: 'nor',
  sv: 'swe',
  da: 'dan',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  nl: 'nld',
  fi: 'fin',
  pl: 'pol',
  ru: 'rus',
  tr: 'tur',
  ar: 'arb',
  zh: 'zho',
  ja: 'jpn',
  ko: 'kor',
  hi: 'hin',
};

// Multiple detection methods for consensus
interface DetectionMethod {
  name: string;
  detect: (text: string) => { code: string; confidence: number } | null;
}

const detectionMethods: DetectionMethod[] = [
  {
    name: 'franc',
    detect: (text: string) => {
      const code = franc(text, { minLength: 1 });
      if (code === 'und') return null;
      
      // Calculate confidence based on text length for franc
      const confidence = Math.min(text.length / 20, 1) * 0.9; // franc is generally reliable
      return { code, confidence };
    }
  },
  {
    name: 'tinyld',
    detect: (text: string) => {
      try {
        const result = tinyld.detect(text, { only: Object.keys(iso1ToIso3) });
        if (!result) return null;
        
        const code = iso1ToIso3[result] || result;
        // TinyLD is fast but less accurate, especially for short texts
        const confidence = Math.min(text.length / 30, 1) * 0.7;
        return { code, confidence };
      } catch (error) {
        return null;
      }
    }
  },
  // Temporarily removed due to build issues
  // {
  //   name: 'language-detector',
  //   detect: (text: string) => {
  //     try {
  //       const results = lngDetector.detect(text, 1);
  //       if (!results || results.length === 0) return null;
  //       
  //       const result = results[0];
  //       const code = iso1ToIso3[result.iso6391] || result.iso6391;
  //       // Language-detector provides confidence scores
  //       const confidence = result.confidence || 0.5;
  //       return { code, confidence };
  //     } catch (error) {
  //       return null;
  //     }
  //   }
  // }
];

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
 * Detect the language of the input text using multiple methods for better accuracy
 * @param text The text to analyze
 * @returns Language detection result with code, name, and instruction
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  // Clean text for better detection
  const cleanedText = cleanTextForDetection(text);
  
  // If text is too short or mostly non-linguistic, default to English
  if (cleanedText.length < 2 || isNonLinguisticText(cleanedText)) {
    return {
      code: 'eng',
      name: 'English',
      confidence: 0.3,
      instruction: 'IMPORTANT: Respond in English.',
    };
  }

  // Run multiple detection methods
  const detectionResults: Array<{ code: string; confidence: number; method: string }> = [];
  
  for (const method of detectionMethods) {
    try {
      const result = method.detect(cleanedText);
      if (result && result.code !== 'und') {
        detectionResults.push({
          code: result.code,
          confidence: result.confidence,
          method: method.name
        });
      }
    } catch (error) {
      console.warn(`Language detection method ${method.name} failed:`, error);
    }
  }
  
  // If no methods detected anything, default to English
  if (detectionResults.length === 0) {
    return {
      code: 'eng',
      name: 'English',
      confidence: 0.4,
      instruction: 'IMPORTANT: Respond in English.',
    };
  }
  
  // Find consensus or best result
  const bestResult = findBestLanguageResult(detectionResults, cleanedText);
  
  // Normalize the language code
  const normalizedCode = normalizeLanguageCode(bestResult.code);
  const languageName = languageNames[normalizedCode] || languageNames[bestResult.code] || 'Unknown';
  
  // Enhance confidence with text characteristics
  const enhancedConfidence = enhanceConfidenceWithTextAnalysis(bestResult.confidence, cleanedText, normalizedCode);
  
  // Create the instruction for the AI
  const instruction = createLanguageInstruction(languageName, normalizedCode);
  
  return {
    code: normalizedCode,
    name: languageName,
    confidence: enhancedConfidence,
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
 * Check if text is mostly non-linguistic (code, numbers, etc.)
 */
function isNonLinguisticText(text: string): boolean {
  const codePatterns = /^[\s\w{}()\[\];:,.<>"'`=+\-*/\\|&^%$#@!?]+$/;
  const mostlyNumbers = /^[\d\s.,]+$/.test(text);
  const tooManySpecialChars = (text.match(/[^\w\s]/g) || []).length > text.length * 0.5;
  
  return codePatterns.test(text) || mostlyNumbers || tooManySpecialChars;
}

/**
 * Find the best language result from multiple detection methods
 */
function findBestLanguageResult(
  results: Array<{ code: string; confidence: number; method: string }>,
  text: string
): { code: string; confidence: number } {
  // Group by language code
  const codeGroups: Record<string, typeof results> = {};
  
  for (const result of results) {
    const normalizedCode = normalizeLanguageCode(result.code);
    if (!codeGroups[normalizedCode]) {
      codeGroups[normalizedCode] = [];
    }
    codeGroups[normalizedCode].push(result);
  }
  
  // Find the code with highest consensus
  let bestCode = '';
  let bestScore = 0;
  
  for (const [code, codeResults] of Object.entries(codeGroups)) {
    // Calculate consensus score: average confidence * method agreement bonus
    const avgConfidence = codeResults.reduce((sum, r) => sum + r.confidence, 0) / codeResults.length;
    const methodBonus = codeResults.length > 1 ? 0.2 : 0; // Bonus for multiple methods agreeing
    const score = avgConfidence + methodBonus;
    
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }
  
  // Return the best result for that code
  const bestCodeResults = codeGroups[bestCode] || [];
  const bestResult = bestCodeResults.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );
  
  return {
    code: bestCode,
    confidence: Math.min(bestScore, 1.0)
  };
}

/**
 * Enhance confidence with text analysis
 */
function enhanceConfidenceWithTextAnalysis(baseConfidence: number, text: string, detectedCode: string): number {
  let confidence = baseConfidence;
  
  // Text length factor - longer text = more confidence
  const lengthFactor = Math.min(text.length / 30, 1);
  confidence *= (0.7 + lengthFactor * 0.3);
  
  // Check for language-specific characters
  const hasNordicChars = /[æøåÆØÅäöÄÖ]/.test(text);
  const hasAsianChars = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
  const hasCyrillicChars = /[\u0400-\u04FF]/.test(text);
  const hasArabicChars = /[\u0600-\u06FF]/.test(text);
  
  // Boost confidence for specific character matches
  if (detectedCode === 'nor' && hasNordicChars) {
    confidence = Math.min(confidence + 0.15, 1.0);
  } else if (['zho', 'jpn', 'kor'].includes(detectedCode) && hasAsianChars) {
    confidence = Math.min(confidence + 0.15, 1.0);
  } else if (detectedCode === 'rus' && hasCyrillicChars) {
    confidence = Math.min(confidence + 0.15, 1.0);
  } else if (detectedCode === 'arb' && hasArabicChars) {
    confidence = Math.min(confidence + 0.15, 1.0);
  }
  
  // Norwegian vs Danish disambiguation
  if (detectedCode === 'nor' || detectedCode === 'dan') {
    confidence = disambiguateNorwegianDanish(text, detectedCode, confidence);
  }
  
  return Math.min(confidence, 1.0);
}

/**
 * Specifically handle Norwegian vs Danish disambiguation
 */
function disambiguateNorwegianDanish(text: string, detectedCode: string, baseConfidence: number): number {
  // Norwegian-specific words and patterns
  const norwegianIndicators = [
    /\b(ikke|og|det|er|til|på|med|for|av|som|har|kan|vil|skal|var|men|fra|når|bare|også|hvor|alle|denne|skulle|bli|hadde|noe|etter|før|kommer|må|får|gjør|går)\b/gi,
    /\b(norsk|norge|oslo|bergen|trondheim|stavanger|kristiansand|drammen|fredrikstad|sandnes|tromsø)\b/gi
  ];
  
  // Danish-specific words and patterns
  const danishIndicators = [
    /\b(ikke|og|det|er|til|på|med|for|af|som|har|kan|vil|skal|var|men|fra|når|bare|også|hvor|alle|denne|skulle|blive|havde|noget|efter|før|kommer|må|får|gør|går)\b/gi,
    /\b(dansk|danmark|københavn|aarhus|odense|aalborg|esbjerg|randers|kolding|horsens|vejle|roskilde|herning|silkeborg|næstved)\b/gi
  ];
  
  let norwegianScore = 0;
  let danishScore = 0;
  
  // Count Norwegian indicators
  for (const pattern of norwegianIndicators) {
    const matches = text.match(pattern) || [];
    norwegianScore += matches.length;
  }
  
  // Count Danish indicators
  for (const pattern of danishIndicators) {
    const matches = text.match(pattern) || [];
    danishScore += matches.length;
  }
  
  // Apply disambiguation bonus
  if (detectedCode === 'nor' && norwegianScore > danishScore) {
    return Math.min(baseConfidence + 0.1, 1.0);
  } else if (detectedCode === 'dan' && danishScore > norwegianScore) {
    return Math.min(baseConfidence + 0.1, 1.0);
  } else if (norwegianScore > danishScore * 1.5) {
    // Strong Norwegian indicators override detection
    return Math.min(baseConfidence + 0.2, 1.0);
  }
  
  return baseConfidence;
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

/**
 * Detect language with context from conversation history and session cache
 */
export function detectLanguageWithContext(
  text: string,
  conversationHistory: { role: string; content: string }[] = [],
  sessionLanguage: { code: string; confidence: number } | null = null
): LanguageDetectionResult {
  // First, detect language normally
  const currentDetection = detectLanguage(text);
  
  // If we have session language and current detection is low confidence, prefer session
  if (sessionLanguage && currentDetection.confidence < 0.8 && sessionLanguage.confidence > 0.7) {
    const languageName = languageNames[sessionLanguage.code] || "Unknown";
    const instruction = createLanguageInstruction(languageName, sessionLanguage.code);
    
    return {
      code: sessionLanguage.code,
      name: languageName,
      confidence: Math.min(sessionLanguage.confidence, 0.9), // Slightly reduce for session cache
      instruction
    };
  }
  
  // Analyze conversation history for consistency
  if (conversationHistory.length > 0) {
    const historyLanguages = conversationHistory
      .filter(msg => msg.role === "user")
      .slice(-3) // Last 3 user messages
      .map(msg => detectLanguage(msg.content))
      .filter(lang => lang.confidence > 0.6);
    
    if (historyLanguages.length > 0) {
      // Check if there's consistency in recent messages
      const mostCommonCode = findMostCommonLanguage(historyLanguages);
      
      if (mostCommonCode && mostCommonCode !== currentDetection.code && currentDetection.confidence < 0.8) {
        // If history suggests different language and current confidence is low, use history
        const languageName = languageNames[mostCommonCode] || "Unknown";
        const instruction = createLanguageInstruction(languageName, mostCommonCode);
        
        return {
          code: mostCommonCode,
          name: languageName,
          confidence: 0.8, // Moderate confidence for history-based detection
          instruction
        };
      }
    }
  }
  
  return currentDetection;
}

/**
 * Find the most common language from recent detections
 */
function findMostCommonLanguage(detections: LanguageDetectionResult[]): string | null {
  const counts: Record<string, number> = {};
  
  for (const detection of detections) {
    counts[detection.code] = (counts[detection.code] || 0) + 1;
  }
  
  let maxCount = 0;
  let mostCommon = null;
  
  for (const [code, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = code;
    }
  }
  
  return mostCommon;
}
