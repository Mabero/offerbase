// FILE PURPOSE: Finds relevant training materials for AI chat responses using keyword matching
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
  maxItems: number = 10
): Promise<ContextItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Normalize and extract keywords for consistent results  
  const normalizedQuery = normalizeQuery(query);
  const keywords = extractSimpleKeywords(normalizedQuery);

  if (keywords.length === 0) {
    return await getFallbackMaterials(supabase, siteId, maxItems);
  }

  // Single database query - let AI decide relevance from results
  const materials = await searchMaterials(supabase, keywords, siteId, maxItems);

  if (materials.length === 0) {
    // Try broader search with individual words if compound search failed
    const broadKeywords = keywords.slice(0, 3); // Use fewer, more general keywords
    const broadResults = await searchMaterials(supabase, broadKeywords, siteId, maxItems);
    
    if (broadResults.length > 0) {
      return broadResults.map(material => ({
        title: material.title,
        content: getFullContent(material),
        sourceInfo: extractSourceInfo(material)
      }));
    }
    
    return await getFallbackMaterials(supabase, siteId, maxItems);
  }

  // No scoring or sorting - just return materials as-is, let AI decide
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
    // Fix common typos and variations (domain-agnostic)
    .replace(/\bwhat\s+is\s+/gi, 'what is ')
    .replace(/\btell\s+me\s+about\s+/gi, 'what is ')
    // Normalize company URL patterns (domain-agnostic)
    .replace(/\b(\w+)\.com\b/gi, '$1')
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, // Supabase type is complex and conflicts with strict schema
  keywords: string[],
  siteId: string,
  limit: number
): Promise<TrainingMaterial[]> {
  try {
    // Prioritize brand/specific keywords over common words
    const priorityKeywords = keywords.filter(k => k.length >= 4 && !isCommonWord(k));
    const commonKeywords = keywords.filter(k => k.length < 4 || isCommonWord(k));
    
    // First try with priority keywords only (more precise search)
    let materials: Array<Record<string, unknown>> = [];
    
    if (priorityKeywords.length > 0) {
      const priorityPatterns = priorityKeywords.map(keyword => `%${keyword}%`);
      
      const { data: priorityResults, error: priorityError } = await supabase
        .from('training_materials')
        .select('id, title, content, summary, metadata, updated_at, site_id')
        .eq('site_id', siteId)
        .eq('scrape_status', 'success')
        .or(
          priorityPatterns.map(pattern => `title.ilike.${pattern},content.ilike.${pattern},summary.ilike.${pattern}`).join(',')
        )
        .order('updated_at', { ascending: false })
        .limit(limit);
        
      if (priorityError) {
        console.error('Priority search error:', priorityError);
      } else {
        materials = priorityResults || [];
      }
    }
    
    // If priority search didn't find enough, supplement with common keywords
    // Also try if priority search found nothing at all (too restrictive)
    if ((materials.length < limit && commonKeywords.length > 0) || materials.length === 0) {
      const allPatterns = keywords.map(keyword => `%${keyword}%`);
      
      const { data: allResults, error } = await supabase
        .from('training_materials')
        .select('id, title, content, summary, metadata, updated_at, site_id')
        .eq('site_id', siteId)
        .eq('scrape_status', 'success')
        .or(
          allPatterns.map(pattern => `title.ilike.${pattern},content.ilike.${pattern},summary.ilike.${pattern}`).join(',')
        )
        .order('updated_at', { ascending: false })
        .limit(limit * 2);
        
      if (error) {
        console.error('Database query error:', error);
        return materials as unknown as TrainingMaterial[]; // Return what we have from priority search
      }
      
      // Combine results, prioritizing exact matches
      const allMaterials = allResults || [];
      const newMaterials = allMaterials.filter((m: any) => !materials.some(existing => existing.id === m.id));
      materials = [...materials, ...newMaterials].slice(0, limit);
    }
    
    const results = materials || [];
    
    // Additional client-side filtering for metadata matches (domain/company intelligence)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadataMatches = results.filter((material: any) => {
      if (!material.metadata) return false;
      
      const metadata = material.metadata;
      // const metadataString = JSON.stringify(metadata).toLowerCase();
      
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
    
    // Remove duplicates and prioritize metadata matches
    // First, get materials that DON'T match metadata
    const contentOnlyMatches = results.filter(material => 
      !metadataMatches.some(metaMatch => metaMatch.id === material.id)
    );
    
    // Prioritize metadata matches (likely more relevant for company queries)
    const prioritized = [
      ...metadataMatches,          // Metadata matches first (most relevant)
      ...contentOnlyMatches        // Content-only matches second
    ].slice(0, limit);
    
    
    return prioritized as unknown as TrainingMaterial[];
  } catch (error) {
    console.error('Search materials error:', error);
    return [];
  }
}


/**
 * Get balanced content from material, preventing length bias
 * Limits content to ensure equal weight regardless of original length
 */
function getFullContent(material: TrainingMaterial): string {
  // No truncation - send full content to AI
  // The model can handle it and needs complete information
  
  let content = '';
  
  // Use full content, not summary (summaries miss specific details)
  if (material.content && material.content.trim().length > 0) {
    content = material.content.trim();
  } else if (material.summary && material.summary.trim().length > 0) {
    content = material.summary.trim();
  } else {
    return `Title: ${material.title}\n(No detailed content available)`;
  }
  
  return content;
}

/**
 * Fallback when no keyword matches found
 */
async function getFallbackMaterials(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, // Supabase type is complex and conflicts with strict schema
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return materials.map((material: any) => ({
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
 * Build rich context with source metadata for AI intelligence
 * Give AI structured information about each material's source and relevance
 */
export function buildOptimizedContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) {
    return '';
  }

  let context = `\n\nTraining Materials:\n`;
  
  contextItems.forEach((item, index) => {
    context += `\n${index + 1}. ${item.title}`;
    
    // Add rich source metadata for AI understanding
    if (item.sourceInfo) {
      const { domain, company, contentType } = item.sourceInfo;
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

  
  return context;
}

/**
 * Check if a word is a common word that should be deprioritized in search
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    // English common words
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
    // Norwegian common words
    'har', 'den', 'det', 'som', 'han', 'med', 'var', 'seg', 'for', 'ikke', 'vil', 'jeg', 'kan', 'hun', 'til', 'på', 'og', 'av', 'er', 'fra', 'deg', 'når', 'hva', 'min', 'din', 'sin', 'vår', 'deres', 'bare', 'enn', 'hvis', 'hvor', 'alle', 'skal', 'selv', 'denne', 'dette', 'disse', 'sånn', 'slik', 'altså', 'eller', 'men', 'så', 'også', 'både', 'enten', 'både', 'hverken',
    // Common recommendation words
    'bra', 'good', 'best', 'great', 'recommend', 'suggest', 'anbefale', 'foreslå',
    // Common question words  
    'what', 'when', 'where', 'why', 'how', 'which', 'who',
    'hva', 'når', 'hvor', 'hvorfor', 'hvordan', 'hvilken', 'hvem'
  ]);
  
  return commonWords.has(word.toLowerCase());
}
