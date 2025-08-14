/**
 * URL Processing Utilities for Site Management
 * Handles URL validation and automatic allowed origins generation
 */

/**
 * Validates if a URL is in the correct format for a website
 */
export function isValidWebsiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Must use HTTP or HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Must have a valid hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    
    // Must have a valid TLD (at least one dot)
    if (!parsed.hostname.includes('.')) {
      return false;
    }
    
    // Reject localhost and IP addresses for production URLs
    if (parsed.hostname === 'localhost' || 
        parsed.hostname.startsWith('127.') ||
        /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes a URL by ensuring it has a protocol and removing trailing slashes
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  
  // Add https:// if no protocol specified
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  
  // Remove trailing slashes except for root
  if (normalized.endsWith('/') && normalized !== normalized.split('/').slice(0, 3).join('/') + '/') {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

/**
 * Generates all allowed origins for a given site URL
 * This includes various protocol and subdomain combinations that users might access the site from
 */
export function generateAllowedOrigins(siteUrl: string): string[] {
  try {
    const normalized = normalizeUrl(siteUrl);
    const parsed = new URL(normalized);
    const hostname = parsed.hostname;
    
    // Remove www prefix to get base domain
    const baseDomain = hostname.replace(/^www\./, '');
    const wwwDomain = `www.${baseDomain}`;
    
    const origins: string[] = [];
    
    // Add HTTPS versions (preferred)
    origins.push(`https://${baseDomain}`);
    if (baseDomain !== wwwDomain.slice(4)) { // Only add www if it's different from base
      origins.push(`https://${wwwDomain}`);
    }
    
    // Add HTTP versions (for backward compatibility)
    origins.push(`http://${baseDomain}`);
    if (baseDomain !== wwwDomain.slice(4)) {
      origins.push(`http://${wwwDomain}`);
    }
    
    // Include localhost for development/testing
    origins.push('http://localhost:3000');
    origins.push('http://localhost:3001');
    origins.push('http://localhost:3002');
    
    // Remove duplicates and return
    return [...new Set(origins)];
  } catch (error) {
    console.error('Error generating allowed origins:', error);
    
    // Fallback to localhost only if URL processing fails
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002'
    ];
  }
}

/**
 * Extracts a display-friendly domain name from a full URL
 */
export function extractDisplayDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname;
  } catch {
    return url; // Return original if parsing fails
  }
}

/**
 * Validates and processes a site URL for storage
 * Returns normalized URL and generated allowed origins
 */
export function processSiteUrl(inputUrl: string): {
  isValid: boolean;
  normalizedUrl?: string;
  allowedOrigins?: string[];
  displayDomain?: string;
  error?: string;
} {
  if (!inputUrl || inputUrl.trim().length === 0) {
    return {
      isValid: false,
      error: 'URL is required'
    };
  }
  
  const normalized = normalizeUrl(inputUrl);
  
  if (!isValidWebsiteUrl(normalized)) {
    return {
      isValid: false,
      error: 'Please enter a valid website URL (e.g., https://example.com)'
    };
  }
  
  return {
    isValid: true,
    normalizedUrl: normalized,
    allowedOrigins: generateAllowedOrigins(normalized),
    displayDomain: extractDisplayDomain(normalized)
  };
}