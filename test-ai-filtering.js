// Test script for AI-powered product filtering
// Run with: node test-ai-filtering.js
// Make sure to set OPENAI_API_KEY and ENABLE_AI_PRODUCT_FILTERING=true in your .env.local

const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

// Test endpoint configuration
const API_BASE = 'http://localhost:3000';
const TEST_SITE_ID = process.env.TEST_SITE_ID; // You'll need to set this

// Test scenarios
const testScenarios = [
  {
    name: 'G4 Hair Removal Context Test',
    query: 'G4 hair removal device',
    expectedIncludes: ['hair', 'removal', 'iviskin', 'ipl'],
    expectedExcludes: ['vacuum', 'gaming', 'monitor']
  },
  {
    name: 'G4 Vacuum Context Test', 
    query: 'G4 vacuum cleaner',
    expectedIncludes: ['vacuum', 'cleaner', 'dyson'],
    expectedExcludes: ['hair', 'removal', 'gaming', 'monitor']
  },
  {
    name: 'G4 Gaming Context Test',
    query: 'G4 gaming monitor',
    expectedIncludes: ['gaming', 'monitor', 'display'],
    expectedExcludes: ['vacuum', 'hair', 'removal']
  },
  {
    name: 'Brand Specific Test',
    query: 'IVISKIN G4',
    expectedIncludes: ['iviskin'],
    expectedExcludes: ['dyson', 'samsung']
  },
  {
    name: 'Generic G4 Test',
    query: 'just G4',
    expectedBehavior: 'Should return multiple types of G4 products'
  }
];

async function testAIFiltering() {
  console.log('🧪 Starting AI Product Filtering Tests\n');
  console.log('=' . repeat(60));

  if (!TEST_SITE_ID) {
    console.error('❌ TEST_SITE_ID not set in environment variables');
    console.log('Add TEST_SITE_ID=your-site-id to .env.local');
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set in environment variables');
    return;
  }

  if (process.env.ENABLE_AI_PRODUCT_FILTERING !== 'true') {
    console.warn('⚠️  ENABLE_AI_PRODUCT_FILTERING is not set to true');
    console.log('Add ENABLE_AI_PRODUCT_FILTERING=true to .env.local for full testing');
  }

  for (const scenario of testScenarios) {
    console.log(`\n🔍 Testing: ${scenario.name}`);
    console.log(`Query: "${scenario.query}"`);
    
    try {
      const response = await fetch(`${API_BASE}/api/products/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note: In real testing, you'd need authentication headers
        },
        body: JSON.stringify({
          siteId: TEST_SITE_ID,
          query: scenario.query,
          limit: 12
        })
      });

      if (!response.ok) {
        console.error(`❌ API Error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        continue;
      }

      const data = await response.json();
      
      if (!data.success) {
        console.error('❌ API returned error:', data.error);
        continue;
      }

      console.log(`📊 Results: ${data.count} products (from ${data.candidatesCount || 'unknown'} candidates)`);
      console.log(`🤖 AI Filtered: ${data.aiFiltered ? 'Yes' : 'No'}`);
      
      if (data.data && data.data.length > 0) {
        console.log('Products returned:');
        data.data.forEach((product, index) => {
          console.log(`  ${index + 1}. ${product.title}`);
        });
      } else {
        console.log('No products returned');
      }

      // Validate expectations
      if (scenario.expectedIncludes || scenario.expectedExcludes) {
        validateResults(data.data, scenario);
      }

    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
    }

    console.log('-' . repeat(40));
  }

  console.log('\n✅ AI Filtering Tests Complete');
}

function validateResults(products, scenario) {
  const allTitles = products.map(p => p.title.toLowerCase()).join(' ');
  
  // Check includes
  if (scenario.expectedIncludes) {
    const foundIncludes = scenario.expectedIncludes.filter(keyword => 
      allTitles.includes(keyword.toLowerCase())
    );
    
    if (foundIncludes.length > 0) {
      console.log(`✅ Found expected keywords: ${foundIncludes.join(', ')}`);
    } else {
      console.log(`⚠️  Missing expected keywords: ${scenario.expectedIncludes.join(', ')}`);
    }
  }

  // Check excludes  
  if (scenario.expectedExcludes) {
    const foundExcludes = scenario.expectedExcludes.filter(keyword =>
      allTitles.includes(keyword.toLowerCase())
    );
    
    if (foundExcludes.length === 0) {
      console.log(`✅ Successfully excluded unwanted keywords`);
    } else {
      console.log(`❌ Found unwanted keywords: ${foundExcludes.join(', ')}`);
    }
  }
}

// Direct AI filtering test (without API)
async function testDirectAIFiltering() {
  console.log('\n🤖 Testing AI Filtering Function Directly\n');
  
  // Import the AI filtering function
  try {
    const { testAIFiltering } = require('./lib/ai/product-filter.ts');
    await testAIFiltering();
  } catch (error) {
    console.error('❌ Direct AI filtering test failed:', error.message);
    console.log('Make sure TypeScript files are compiled or use ts-node');
  }
}

// Run tests
if (require.main === module) {
  testAIFiltering()
    .then(() => testDirectAIFiltering())
    .catch(console.error);
}

module.exports = { testAIFiltering };