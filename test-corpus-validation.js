/**
 * Test script for the new existence-only corpus validation system
 * Run with: node test-corpus-validation.js
 */

import { TermExtractor } from './lib/search/term-extractor.js';
import { CorpusValidator } from './lib/search/corpus-validator.js';
import { createClient } from '@supabase/supabase-js';

// Test scenarios
const testCases = [
  {
    name: "Squarespace query (should work now)",
    query: "Er Squarespace bra?",
    expectTerms: ["squarespace", "bra"],
    expectKept: ["squarespace"], // assuming "bra" doesn't exist in corpus
    expectAnswers: true
  },
  {
    name: "Product with digits",
    query: "G3 weight specifications?",
    expectTerms: ["g3", "weight", "specifications"],
    expectKept: ["g3"], // assuming g3 exists
    expectAnswers: true
  },
  {
    name: "Non-existent terms",
    query: "Kong Harald av Norge?",
    expectTerms: ["kong", "harald", "norge"],
    expectKept: [], // assuming none exist
    expectAnswers: false
  },
  {
    name: "Bigram phrase",
    query: "Squarespace Website builder features?",
    expectTerms: ["squarespace", "website", "builder", "features", "squarespace website"],
    expectKept: ["squarespace website"], // assuming phrase exists
    expectAnswers: true
  }
];

async function runTests() {
  console.log('🧪 Testing Existence-Only Corpus Validation\n');
  
  // Initialize components
  const extractor = new TermExtractor();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const validator = new CorpusValidator(supabase);
  
  // Test site ID (you'll need to replace with actual site ID)
  const testSiteId = '00000000-0000-0000-0000-000000000000'; 
  
  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`   Query: "${testCase.query}"`);
    
    try {
      // 1. Extract terms
      const extracted = extractor.extractTerms(testCase.query);
      
      if (!extracted) {
        console.log('   ❌ Non-Latin script detected - would use trigram fallback');
        continue;
      }
      
      console.log(`   📤 Extracted: [${extracted.combined.join(', ')}]`);
      
      // 2. Validate terms
      const validation = await validator.validateTerms(extracted.combined, testSiteId);
      
      console.log(`   ✅ Kept: [${validation.kept.join(', ')}]`);
      console.log(`   ❌ Dropped: [${validation.dropped.map(d => `${d.term}(${d.reason})`).join(', ')}]`);
      console.log(`   📊 Cache: ${validation.telemetry.cacheHits}hits/${validation.telemetry.dbQueries}queries`);
      
      // 3. Check ranking logic (simulate what VectorSearchService does)
      const maxTerms = 3;
      const rankedTerms = validation.kept
        .sort((a, b) => {
          const aData = validation.validatedTerms.find(t => t.term === a);
          const bData = validation.validatedTerms.find(t => t.term === b);
          
          // Priority: bigrams → digits → length → doc_count
          const aIsBigram = a.includes(' ');
          const bIsBigram = b.includes(' ');
          if (aIsBigram !== bIsBigram) return aIsBigram ? -1 : 1;
          
          const aHasDigit = /\d/.test(a);
          const bHasDigit = /\d/.test(b);
          if (aHasDigit !== bHasDigit) return aHasDigit ? -1 : 1;
          
          if (a.length !== b.length) return b.length - a.length;
          
          const aCount = aData?.docCount || 0;
          const bCount = bData?.docCount || 0;
          return aCount - bCount;
        })
        .slice(0, maxTerms);
      
      console.log(`   🏆 Final ranked terms: [${rankedTerms.join(', ')}]`);
      console.log(`   🎯 Would answer: ${rankedTerms.length > 0 ? 'YES' : 'NO'}\n`);
      
    } catch (error) {
      console.log(`   💥 Error: ${error.message}\n`);
    }
  }
  
  console.log('✅ Test completed!');
  console.log('\n📋 Expected behavior:');
  console.log('  • "Squarespace" should be kept regardless of frequency');
  console.log('  • Bigrams should rank higher than single tokens');
  console.log('  • Terms with digits (G3) should rank high');
  console.log('  • Non-existent terms should be dropped');
  console.log('  • System should be universal (no hardcoding)');
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };