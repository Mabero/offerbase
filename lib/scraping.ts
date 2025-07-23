// Shared scraping logic that can be used by both HTTP API and internal functions
import { ScrapeResult, TrainingMetadata } from '@/types/training';
import * as cheerio from 'cheerio';

// Helper function to clean and extract content
function extractContent(html: string): { content: string; metadata: TrainingMetadata } {
  const $ = cheerio.load(html);
  
  // Remove script and style elements
  $('script, style, nav, header, footer, aside, .advertisement, .ads, #cookie-banner').remove();
  
  // Extract metadata
  const metadata: TrainingMetadata = {
    title: $('meta[property="og:title"]').attr('content') || 
           $('meta[name="twitter:title"]').attr('content') || 
           $('title').text() || '',
    description: $('meta[property="og:description"]').attr('content') || 
                 $('meta[name="description"]').attr('content') || 
                 $('meta[name="twitter:description"]').attr('content') || '',
    mainImage: $('meta[property="og:image"]').attr('content') || 
               $('meta[name="twitter:image"]').attr('content') || '',
    keywords: $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim()) || [],
    siteName: $('meta[property="og:site_name"]').attr('content') || '',
    language: $('html').attr('lang') || 'en',
  };
  
  // Extract author
  const author = $('meta[name="author"]').attr('content') || 
                 $('meta[property="article:author"]').attr('content') ||
                 $('.author').first().text().trim();
  if (author) metadata.author = author;
  
  // Extract published date
  const publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('time[datetime]').first().attr('datetime') ||
                       $('meta[name="publish_date"]').attr('content');
  if (publishedDate) metadata.publishedDate = publishedDate;
  
  // Extract all images
  const images: string[] = [];
  $('img').each((_, elem) => {
    const src = $(elem).attr('src');
    if (src && !src.includes('data:image')) {
      images.push(src);
    }
  });
  metadata.images = [...new Set(images)].slice(0, 10); // Limit to 10 unique images
  
  // Try to extract structured data (JSON-LD)
  const structuredData: Record<string, unknown> = {};
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const data = JSON.parse($(elem).html() || '{}');
      Object.assign(structuredData, data);
    } catch {
      // Ignore parsing errors
    }
  });
  if (Object.keys(structuredData).length > 0) {
    metadata.structuredData = structuredData;
    
    // Extract product info if available
    if (structuredData['@type'] === 'Product' || structuredData.product) {
      const product = (structuredData.product || structuredData) as Record<string, unknown>;
      const offers = product?.offers as Record<string, unknown> | undefined;
      const aggregateRating = product?.aggregateRating as Record<string, unknown> | undefined;
      const brand = product?.brand as Record<string, unknown> | string | undefined;
      
      metadata.productInfo = {
        name: product?.name as string,
        price: offers?.price as string,
        currency: offers?.priceCurrency as string,
        availability: offers?.availability as string,
        brand: (typeof brand === 'object' ? brand?.name : brand) as string,
        category: product?.category as string,
        sku: product?.sku as string,
        rating: aggregateRating?.ratingValue as number,
        reviewCount: aggregateRating?.reviewCount as number,
      };
    }
  }
  
  // Extract main content using various strategies
  let content = '';
  
  // Strategy 1: Look for article or main content areas
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '#content',
    '.post-content',
    '.entry-content',
    '.article-body',
    '.post-body'
  ];
  
  for (const selector of contentSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      content = element.text().trim();
      if (content.length > 100) break; // Found substantial content
    }
  }
  
  // Strategy 2: If no content found, get all paragraph text
  if (content.length < 100) {
    const paragraphs: string[] = [];
    $('p').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 30) { // Filter out short paragraphs
        paragraphs.push(text);
      }
    });
    content = paragraphs.join('\n\n');
  }
  
  // Strategy 3: If still no content, get all text
  if (content.length < 100) {
    content = $('body').text().trim();
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
    .trim();
  
  metadata.contentLength = content.length;
  
  return { content, metadata };
}

// Main scraping function that can be used internally
export async function scrapeUrl(url: string, options?: { userAgent?: string; timeout?: number }): Promise<ScrapeResult> {
  try {
    // Validate URL
    try {
      new URL(url);
    } catch {
      return {
        success: false,
        error: 'Invalid URL'
      };
    }
    
    
    // Fetch the HTML content
    const response = await fetch(url, {
      headers: {
        'User-Agent': options?.userAgent || 'Mozilla/5.0 (compatible; AffiBot/1.0; +https://affi.ai/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow',
      // Set timeout to 30 seconds
      signal: AbortSignal.timeout(options?.timeout || 30000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    const html = await response.text();
    
    // Extract content and metadata
    const { content, metadata } = extractContent(html);
    
    if (content.length < 50) {
      throw new Error('Insufficient content extracted from the page');
    }
    
    // Determine content type
    let detectedContentType = 'webpage';
    const urlLower = url.toLowerCase();
    const contentLower = content.toLowerCase();
    
    if (metadata.structuredData?.['@type'] === 'Product' || metadata.productInfo) {
      detectedContentType = 'product';
    } else if (urlLower.includes('/faq') || urlLower.includes('/help') || 
               contentLower.includes('frequently asked questions')) {
      detectedContentType = 'faq';
    } else if (urlLower.includes('/docs') || urlLower.includes('/documentation')) {
      detectedContentType = 'documentation';
    } else if (metadata.structuredData?.['@type'] === 'Article' || 
               urlLower.includes('/blog') || urlLower.includes('/article')) {
      detectedContentType = 'article';
    }
    
    return {
      success: true,
      content,
      metadata,
      contentType: detectedContentType,
    };
    
  } catch (error) {
    console.error('Scraping error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}