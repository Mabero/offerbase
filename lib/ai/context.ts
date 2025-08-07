/**
 * Simple, Reliable Training Material Context Selection
 * Enterprise-grade system that prioritizes data inclusion over filtering
 */

import { createClient } from '@supabase/supabase-js';

interface TrainingMaterial {
  id: string;
  title: string;
  content?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  updated_at: string;
}

interface ContextItem {
  title: string;
  content: string;
  sourceInfo?: {
    url?: string;
    domain?: string;
    company?: string;
    contentType?: string;
  };
}

/**
 * Ultra-simple context selection - let AI handle all relevance decisions
 * Just find materials containing keywords and return them - AI decides usefulness
 */
export async function selectRelevantContext(
  query: string,
  siteId: string,
  maxItems: number = 10,
  _conversationHistory: Array<{ role: string; content: string }> = []
): Promise<ContextItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Normalize and extract keywords for consistent results  
  const normalizedQuery = normalizeQuery(query);
  const keywords = extractSimpleKeywords(normalizedQuery);
  console.log(`🔍 Normalized query: "${normalizedQuery}" → Keywords: [${keywords.join(', ')}]`);

  if (keywords.length === 0) {
    console.log('⚠️ No keywords found, returning recent materials');
    return await getFallbackMaterials(supabase, siteId, maxItems);
  }

  // Single database query - let AI decide relevance from results
  const materials = await searchMaterials(supabase, keywords, siteId, maxItems);
  console.log(`📚 Found ${materials.length} materials containing keywords`);

  if (materials.length === 0) {
    console.log('⚠️ No keyword matches, trying broader search...');
    // Try broader search with individual words if compound search failed
    const broadKeywords = keywords.slice(0, 3); // Use fewer, more general keywords
    const broadResults = await searchMaterials(supabase, broadKeywords, siteId, maxItems);
    
    if (broadResults.length > 0) {
      console.log(`📚 Broader search found ${broadResults.length} materials`);
      return broadResults.map(material => ({
        title: material.title,
        content: getFullContent(material),
        sourceInfo: extractSourceInfo(material)
      }));
    }
    
    console.log('⚠️ No matches found, returning recent materials');
    return await getFallbackMaterials(supabase, siteId, maxItems);
  }

  // No scoring or sorting - just return materials as-is, let AI decide
  console.log(`✅ Returning ${materials.length} materials for AI evaluation`);

  return materials.map(material => ({
    title: material.title,
    content: getFullContent(material),
    sourceInfo: extractSourceInfo(material)
  }));
}

/**
 * Extract domain and company information from training material metadata
 * Generic approach that works for any domain/company
 */
function extractSourceInfo(material: TrainingMaterial): ContextItem['sourceInfo'] {
  const metadata = material.metadata || {};
  
  // Extract URL and derive domain
  let url = '';
  let domain = '';
  let company = '';
  
  // Look for URL in various metadata fields
  if (typeof metadata.url === 'string') {
    url = metadata.url;
  } else if (typeof metadata.sourceUrl === 'string') {
    url = metadata.sourceUrl;
  } else if (typeof metadata.originalUrl === 'string') {
    url = metadata.originalUrl;
  }
  
  // Extract domain from URL
  if (url) {
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname.replace('www.', '');
    } catch {
      // If URL parsing fails, try to extract domain from string
      const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\?]+)/);
      if (domainMatch) {
        domain = domainMatch[1];
      }
    }
  }
  
  // Extract or derive company name
  if (typeof metadata.siteName === 'string') {
    company = metadata.siteName;
  } else if (typeof metadata.author === 'string') {
    company = metadata.author;
  } else if (domain) {
    // Generic company name derivation from domain
    company = domain
      .replace(/\.(com|org|net|io|co|app|dev)$/, '') // Remove common TLD
      .split('.')[0] // Take first part of domain
      .replace(/[-_]/g, ' ') // Replace hyphens/underscores with spaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize
      .join(' ');
  }
  
  // Determine content type
  const contentType = (metadata.contentType as string) || 'webpage';
  
  return {
    url: url || undefined,
    domain: domain || undefined, 
    company: company || undefined,
    contentType
  };
}

/**
 * Normalize query for consistent keyword extraction
 * Handles typos, variations, and common patterns
 */
function normalizeQuery(query: string): string {
  return query
    // Fix common typos and variations
    .replace(/\bwebsite\s*builder\b/gi, 'website builder')
    .replace(/\bweb\s*builder\b/gi, 'website builder')  
    .replace(/\bsite\s*builder\b/gi, 'website builder')
    // Normalize "what is" patterns
    .replace(/\bwhat\s+is\s+/gi, 'what is ')
    .replace(/\btell\s+me\s+about\s+/gi, 'what is ')
    // Normalize company name patterns
    .replace(/\b(\w+)\.com\b/gi, '$1') // Remove .com for company matching
    .replace(/\b(\w+)\s*website\b/gi, '$1') // "CompanyName website" → "CompanyName"
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart keyword extraction with company name detection
 * Generic approach that works for any company/domain
 */
function extractSimpleKeywords(query: string): string[] {
  const words = query
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);

  const keywords = [];
  
  // Add original words (lowercased)
  keywords.push(...words.map(w => w.toLowerCase()));
  
  // Detect potential company names (capitalized words or brand patterns)
  const potentialCompanies = words.filter(word => {
    // Capitalized word that's not a common word
    const isCapitalized = word[0] && word[0] === word[0].toUpperCase();
    const isCommonWord = ['What', 'Where', 'When', 'How', 'Why', 'Who', 'Can', 'Could', 'Would', 'Should', 'Will', 'The', 'This', 'That'].includes(word);
    return isCapitalized && !isCommonWord && word.length > 3;
  });
  
  // For potential company names, add domain variations
  potentialCompanies.forEach(company => {
    const companyLower = company.toLowerCase();
    keywords.push(companyLower);
    
    // Add potential domain variations (generic approach)
    keywords.push(`${companyLower}.com`);
    keywords.push(`${companyLower}.org`);
    keywords.push(`${companyLower}.io`);
    
    // Add with common separators
    keywords.push(companyLower.replace(/\s+/g, ''));  // Remove spaces
    keywords.push(companyLower.replace(/\s+/g, '-')); // Hyphenated
    keywords.push(companyLower.replace(/\s+/g, '_')); // Underscored
  });
  
  // Add semantic expansions for common query patterns
  const expansions = [];
  const queryLower = query.toLowerCase();
  
  // Generic semantic understanding
  if (queryLower.includes('recommend') || queryLower.includes('suggest') || queryLower.includes('best')) {
    expansions.push('recommendation', 'review', 'comparison', 'top');
  }
  
  if (queryLower.includes('how') || queryLower.includes('guide') || queryLower.includes('tutorial')) {
    expansions.push('tutorial', 'guide', 'howto', 'steps', 'instructions');
  }
  
  if (queryLower.includes('pricing') || queryLower.includes('cost') || queryLower.includes('price')) {
    expansions.push('pricing', 'cost', 'price', 'plans', 'packages');
  }
  
  keywords.push(...expansions);
  
  // Return unique keywords, limited to reasonable number
  return [...new Set(keywords)].slice(0, 15);
}

/**
 * Search materials using simple keyword matching
 */
async function searchMaterials(
  supabase: any,
  keywords: string[],
  siteId: string,
  limit: number
): Promise<TrainingMaterial[]> {
  try {
    // Build ILIKE patterns for each keyword
    const patterns = keywords.map(keyword => `%${keyword}%`);
    
    // Enhanced query that searches title, content, AND metadata for domain/company matches
    const { data: materials, error } = await supabase
      .from('training_materials')
      .select('id, title, content, summary, metadata, updated_at')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success')
      .or(
        // Search in title and content (original)
        patterns.map(pattern => `title.ilike.${pattern},content.ilike.${pattern},summary.ilike.${pattern}`).join(',')
      )
      .order('updated_at', { ascending: false })
      .limit(limit * 2); // Get more results for metadata filtering

    if (error) {
      console.error('Database query error:', error);
      return [];
    }
    
    const results = materials || [];
    
    // Additional client-side filtering for metadata matches (domain/company intelligence)
    const metadataMatches = results.filter(material => {
      if (!material.metadata) return false;
      
      const metadata = material.metadata;
      const metadataString = JSON.stringify(metadata).toLowerCase();
      
      // Check if any keyword matches metadata fields (URL, siteName, etc.)
      return keywords.some(keyword => {
        const keywordLower = keyword.toLowerCase();
        
        // Check specific metadata fields that might contain company/domain info
        if (typeof metadata.url === 'string' && metadata.url.toLowerCase().includes(keywordLower)) return true;
        if (typeof metadata.siteName === 'string' && metadata.siteName.toLowerCase().includes(keywordLower)) return true;
        if (typeof metadata.author === 'string' && metadata.author.toLowerCase().includes(keywordLower)) return true;
        if (typeof metadata.sourceUrl === 'string' && metadata.sourceUrl.toLowerCase().includes(keywordLower)) return true;
        
        return false;
      });
    });
    
    // Combine content matches with metadata matches, remove duplicates
    const allMatches = [...results, ...metadataMatches];
    const uniqueMatches = allMatches.filter((material, index, arr) => 
      arr.findIndex(m => m.id === material.id) === index
    );
    
    // Prioritize metadata matches (likely more relevant for company queries)
    const prioritized = [
      ...metadataMatches,
      ...uniqueMatches.filter(m => !metadataMatches.some(mm => mm.id === m.id))
    ].slice(0, limit);
    
    console.log(`🔍 Found ${results.length} content matches, ${metadataMatches.length} metadata matches, returning ${prioritized.length}`);
    
    return prioritized;
  } catch (error) {
    console.error('Search materials error:', error);
    return [];
  }
}


/**
 * Get full content from material, preferring complete content over summaries
 */
function getFullContent(material: TrainingMaterial): string {
  // Always prefer full content over summaries for completeness
  if (material.content && material.content.trim().length > 0) {
    return material.content.trim();
  }
  
  if (material.summary && material.summary.trim().length > 0) {
    return material.summary.trim();
  }
  
  return `Title: ${material.title}\n(No detailed content available)`;
}

/**
 * Fallback when no keyword matches found
 */
async function getFallbackMaterials(
  supabase: any,
  siteId: string,
  maxItems: number
): Promise<ContextItem[]> {
  try {
    const { data: materials, error } = await supabase
      .from('training_materials')
      .select('id, title, content, summary, metadata, updated_at')
      .eq('site_id', siteId)
      .eq('scrape_status', 'success')
      .not('content', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(maxItems);

    if (error || !materials) {
      console.error('Fallback query error:', error);
      return [];
    }

    return materials.map(material => ({
      title: material.title,
      content: getFullContent(material),
      sourceInfo: extractSourceInfo(material)
    }));
  } catch (error) {
    console.error('Fallback materials error:', error);
    return [];
  }
}

/**
 * Build domain scope summary to show AI the full range of available materials
 * Prevents AI from incorrectly limiting scope to single domain
 */
function buildDomainScopeSummary(contextItems: ContextItem[]): string {
  // Extract unique domains and companies from context items
  const domains = new Set<string>();
  const companies = new Set<string>();
  
  contextItems.forEach(item => {
    if (item.sourceInfo?.domain) {
      domains.add(item.sourceInfo.domain);
    }
    if (item.sourceInfo?.company) {
      companies.add(item.sourceInfo.company);
    }
  });
  
  // Build summary
  let summary = 'SCOPE AWARENESS: ';
  
  if (companies.size > 0) {
    const companiesList = Array.from(companies).slice(0, 5); // Limit to avoid too long
    summary += `You have materials from ${companies.size} companies: ${companiesList.join(', ')}`;
    if (companies.size > 5) {
      summary += ` and ${companies.size - 5} others`;
    }
  }
  
  if (domains.size > 0) {
    const domainsList = Array.from(domains).slice(0, 3);
    summary += ` | Domains include: ${domainsList.join(', ')}`;
    if (domains.size > 3) {
      summary += ` +${domains.size - 3} more`;
    }
  }
  
  if (companies.size === 0 && domains.size === 0) {
    summary += 'You have materials from multiple sources.';
  }
  
  summary += ' - You are NOT limited to a single domain or company.';
  
  return summary;
}

/**
 * Build rich context with source metadata for AI intelligence
 * Give AI structured information about each material's source and relevance
 */
export function buildOptimizedContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) {
    return '';
  }

  // Build domain scope summary for AI awareness
  const domainSummary = buildDomainScopeSummary(contextItems);
  
  let context = `\n\n${domainSummary}\n\nTraining Materials with Source Intelligence:\n`;
  
  contextItems.forEach((item, index) => {
    context += `\n${index + 1}. ${item.title}`;
    
    // Add rich source metadata for AI understanding
    if (item.sourceInfo) {
      const { domain, company, url, contentType } = item.sourceInfo;
      const sourceDetails = [];
      
      if (company) sourceDetails.push(`Company: ${company}`);
      if (domain) sourceDetails.push(`Domain: ${domain}`);
      if (contentType && contentType !== 'webpage') sourceDetails.push(`Type: ${contentType}`);
      
      if (sourceDetails.length > 0) {
        context += ` [${sourceDetails.join(' | ')}]`;
      }
    }
    
    context += `:\n${item.content}\n`;
  });

  console.log(`📝 Built enriched context: ${context.length} characters from ${contextItems.length} materials with source metadata`);
  
  return context;
}