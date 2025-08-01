declare module 'language-detector' {
  interface DetectionResult {
    iso6391: string;
    confidence: number;
  }

  class LanguageDetector {
    constructor();
    detect(text: string, maxResults?: number): DetectionResult[];
  }

  export = LanguageDetector;
}