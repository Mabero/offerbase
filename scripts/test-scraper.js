// Simple script to test the scraping functionality
const fetch = require('node-fetch');

async function testScraper() {
  console.log('Testing scraper...');
  
  try {
    const response = await fetch('http://localhost:3001/api/scrape-content', {
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
    console.log('Scraper result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error testing scraper:', error);
  }
}

testScraper();