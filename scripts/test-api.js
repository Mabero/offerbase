// Test script to check if our APIs are working
const fetch = require('node-fetch');

async function testAPIs() {
  const baseUrl = 'http://localhost:3001';
  
  console.log('Testing APIs...\n');
  
  // Test 1: Test scrape API with internal key
  console.log('1. Testing scrape API...');
  try {
    const response = await fetch(`${baseUrl}/api/scrape-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': 'default-internal-key'
      },
      body: JSON.stringify({
        url: 'https://example.com'
      })
    });
    
    const result = await response.json();
    console.log('   Status:', response.status);
    console.log('   Success:', result.success);
    if (result.error) console.log('   Error:', result.error);
    if (result.content) console.log('   Content length:', result.content?.length);
  } catch (error) {
    console.log('   Error:', error.message);
  }
  
  console.log('\n2. Testing widget settings API...');
  try {
    const response = await fetch(`${baseUrl}/api/widget-settings?siteId=test-site`);
    const result = await response.json();
    console.log('   Status:', response.status);
    if (result.error) console.log('   Error:', result.error);
    if (result.settings) console.log('   Settings received');
  } catch (error) {
    console.log('   Error:', error.message);
  }
  
  console.log('\nDone testing.');
}

testAPIs();