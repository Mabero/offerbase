/**
 * Comprehensive language detection test suite
 * Run this to verify the improved language detection accuracy
 */

import { detectLanguage, detectLanguageWithContext } from './language';

// Test cases for different languages and scenarios
const testCases = [
  // Norwegian tests
  {
    text: "Hei, jeg trenger hjelp med å finne riktig produkt for mitt firma.",
    expectedCode: 'nor',
    scenario: 'Norwegian - business inquiry'
  },
  {
    text: "Kan du hjelpe meg med å forstå hvordan dette fungerer?",
    expectedCode: 'nor',
    scenario: 'Norwegian - help request'
  },
  {
    text: "Takk for at du hjelper meg med dette problemet. Det er veldig viktig for oss.",
    expectedCode: 'nor',
    scenario: 'Norwegian - longer text with context'
  },
  
  // Danish tests
  {
    text: "Hej, jeg har brug for hjælp til at finde det rigtige produkt til min virksomhed.",
    expectedCode: 'dan',
    scenario: 'Danish - business inquiry'
  },
  {
    text: "Kan du hjælpe mig med at forstå hvordan dette fungerer?",
    expectedCode: 'dan',
    scenario: 'Danish - help request'
  },
  
  // English tests
  {
    text: "Hello, I need help finding the right product for my business.",
    expectedCode: 'eng',
    scenario: 'English - business inquiry'
  },
  {
    text: "Can you help me understand how this works?",
    expectedCode: 'eng',
    scenario: 'English - help request'
  },
  
  // German tests
  {
    text: "Hallo, ich brauche Hilfe beim Finden des richtigen Produkts für mein Unternehmen.",
    expectedCode: 'deu',
    scenario: 'German - business inquiry'
  },
  
  // French tests
  {
    text: "Bonjour, j'ai besoin d'aide pour trouver le bon produit pour mon entreprise.",
    expectedCode: 'fra',
    scenario: 'French - business inquiry'
  },
  
  // Spanish tests
  {
    text: "Hola, necesito ayuda para encontrar el producto adecuado para mi empresa.",
    expectedCode: 'spa',
    scenario: 'Spanish - business inquiry'
  },
  
  // Short text tests (challenging cases)
  {
    text: "Hei",
    expectedCode: 'nor',
    scenario: 'Norwegian - very short'
  },
  {
    text: "Takk",
    expectedCode: 'nor',
    scenario: 'Norwegian - single word'
  },
  {
    text: "Hello",
    expectedCode: 'eng',
    scenario: 'English - very short'
  },
  
  // Mixed content tests
  {
    text: "Jeg har problemer med https://example.com og email@test.com",
    expectedCode: 'nor',
    scenario: 'Norwegian with URLs and emails'
  },
  
  // Technical content
  {
    text: "Jeg trenger hjelp med function getData() { return data; }",
    expectedCode: 'nor',
    scenario: 'Norwegian with code'
  }
];

// Test session-based language caching
const conversationHistoryTest = [
  { role: 'user', content: 'Hei, jeg trenger hjelp med produkter.' },
  { role: 'assistant', content: 'Hei! Jeg kan hjelpe deg med å finne riktige produkter.' },
  { role: 'user', content: 'Takk' }, // Short text that might be ambiguous
];

export function runLanguageDetectionTests(): void {
  console.log('🚀 Starting comprehensive language detection tests...\n');
  
  let totalTests = 0;
  let passedTests = 0;
  const results: Array<{
    scenario: string;
    text: string;
    expected: string;
    detected: string;
    confidence: number;
    passed: boolean;
  }> = [];
  
  // Test basic detection
  console.log('📝 Testing basic language detection...');
  for (const testCase of testCases) {
    totalTests++;
    const result = detectLanguage(testCase.text);
    const passed = result.code === testCase.expectedCode;
    
    if (passed) passedTests++;
    
    results.push({
      scenario: testCase.scenario,
      text: testCase.text,
      expected: testCase.expectedCode,
      detected: result.code,
      confidence: result.confidence,
      passed
    });
    
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testCase.scenario}`);
    console.log(`   Text: "${testCase.text.substring(0, 50)}${testCase.text.length > 50 ? '...' : ''}"`);
    console.log(`   Expected: ${testCase.expectedCode}, Got: ${result.code}, Confidence: ${result.confidence.toFixed(2)}\n`);
  }
  
  // Test context-aware detection
  console.log('🧠 Testing context-aware language detection...');
  totalTests++;
  const contextResult = detectLanguageWithContext(
    'Takk', // Ambiguous short text
    conversationHistoryTest
  );
  const contextPassed = contextResult.code === 'nor';
  
  if (contextPassed) passedTests++;
  
  results.push({
    scenario: 'Context-aware detection (short text)',
    text: 'Takk',
    expected: 'nor',
    detected: contextResult.code,
    confidence: contextResult.confidence,
    passed: contextPassed
  });
  
  const contextStatus = contextPassed ? '✅ PASS' : '❌ FAIL';
  console.log(`${contextStatus} Context-aware detection`);
  console.log(`   Text: "Takk" (with Norwegian conversation history)`);
  console.log(`   Expected: nor, Got: ${contextResult.code}, Confidence: ${contextResult.confidence.toFixed(2)}\n`);
  
  // Test session language preference
  console.log('💾 Testing session language caching...');
  totalTests++;
  const sessionResult = detectLanguageWithContext(
    'Help me', // English text
    [],
    { code: 'nor', confidence: 0.9 } // Strong Norwegian session preference
  );
  // Should still detect English because confidence is high enough
  const sessionPassed = sessionResult.code === 'eng';
  
  if (sessionPassed) passedTests++;
  
  results.push({
    scenario: 'Session caching (high confidence override)',
    text: 'Help me',
    expected: 'eng',
    detected: sessionResult.code,
    confidence: sessionResult.confidence,
    passed: sessionPassed
  });
  
  const sessionStatus = sessionPassed ? '✅ PASS' : '❌ FAIL';
  console.log(`${sessionStatus} Session caching test`);
  console.log(`   Text: "Help me" (with Norwegian session cache)`);
  console.log(`   Expected: eng, Got: ${sessionResult.code}, Confidence: ${sessionResult.confidence.toFixed(2)}\n`);
  
  // Results summary
  console.log('📊 Test Results Summary:');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);
  
  // Failed tests detail
  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 0) {
    console.log('❌ Failed Tests:');
    for (const failed of failedTests) {
      console.log(`   ${failed.scenario}: Expected ${failed.expected}, got ${failed.detected}`);
    }
    console.log('');
  }
  
  // Performance insights
  console.log('🎯 Performance Insights:');
  const highConfidenceTests = results.filter(r => r.confidence >= 0.8);
  const mediumConfidenceTests = results.filter(r => r.confidence >= 0.6 && r.confidence < 0.8);
  const lowConfidenceTests = results.filter(r => r.confidence < 0.6);
  
  console.log(`High confidence (≥0.8): ${highConfidenceTests.length}/${totalTests} (${((highConfidenceTests.length / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Medium confidence (0.6-0.8): ${mediumConfidenceTests.length}/${totalTests} (${((mediumConfidenceTests.length / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Low confidence (<0.6): ${lowConfidenceTests.length}/${totalTests} (${((lowConfidenceTests.length / totalTests) * 100).toFixed(1)}%)`);
  
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  console.log(`Average confidence: ${avgConfidence.toFixed(2)}`);
  
  console.log('\n🏁 Language detection test completed!');
}

// Auto-run tests if this file is executed directly
if (require.main === module) {
  runLanguageDetectionTests();
}