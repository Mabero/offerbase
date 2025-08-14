/**
 * JWT-based widget authentication system
 * Provides secure, short-lived tokens for embedded chat widgets
 */

import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

// JWT token payload for widget authentication
export interface SiteToken {
  siteId: string;
  origin: string;
  parentOrigin?: string | null;
  scope: 'products:read';
  exp: number;
  iat: number;
}

// Widget configuration returned by bootstrap endpoint
export interface WidgetConfig {
  siteId: string;
  token: string;
  expiresAt: number;
  settings: {
    chat_name: string;
    chat_color: string;
    chat_icon_url?: string;
    chat_name_color: string;
    chat_bubble_icon_color: string;
    input_placeholder: string;
    font_size: string;
    intro_message: string;
  };
}

/**
 * Get the JWT secret from environment variables
 */
function getJWTSecret(): string {
  const secret = process.env.WIDGET_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('WIDGET_JWT_SECRET or NEXTAUTH_SECRET must be set');
  }
  return secret;
}

/**
 * Create a short-lived JWT token for widget authentication
 */
export function createSiteToken(siteId: string, origin: string, parentOrigin?: string | null): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SiteToken = {
    siteId,
    origin,
    parentOrigin,
    scope: 'products:read',
    exp: now + (10 * 60), // 10 minutes
    iat: now
  };

  return jwt.sign(payload, getJWTSecret(), {
    algorithm: 'HS256'
  });
}

/**
 * Verify and decode a site token
 */
export function verifySiteToken(token: string): SiteToken | null {
  try {
    const decoded = jwt.verify(token, getJWTSecret(), {
      algorithms: ['HS256'],
      clockTolerance: 30 // 30 seconds clock skew tolerance
    }) as SiteToken;

    // Validate token structure
    if (!decoded.siteId || !decoded.origin || decoded.scope !== 'products:read') {
      console.warn('Invalid token structure:', { decoded });
      return null;
    }

    return decoded;
  } catch (error) {
    console.warn('Token verification failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Extract request origin from headers with fallbacks
 */
export function getRequestOrigin(request: NextRequest): string | null {
  // Prefer Origin header (most reliable)
  const origin = request.headers.get('origin');
  if (origin) return origin;

  // Fallback to Referer header
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Invalid referer URL
    }
  }

  return null;
}

/**
 * Validate origin against site's allowed origins
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  
  // Normalize origin (remove trailing slashes, etc.)
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');
  
  return allowedOrigins.some(allowed => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
    return normalizedOrigin === normalizedAllowed;
  });
}

/**
 * Validate widget request with dual-origin check for iframe security
 * Supports both direct API access and iframe-based widget access
 */
export function isWidgetRequestAllowed(
  origin: string | null, 
  parentOrigin: string | null, 
  allowedOrigins: string[]
): { allowed: boolean; reason?: string } {
  // If no origin provided, deny
  if (!origin) {
    return { allowed: false, reason: 'No origin header' };
  }

  // Check if request comes from offerbase.co (the iframe)
  const isFromOfferbase = origin.includes('offerbase.co');
  
  if (isFromOfferbase) {
    // For iframe requests, validate the parent origin
    if (!parentOrigin) {
      return { allowed: false, reason: 'Iframe request missing parent origin' };
    }
    
    if (!isOriginAllowed(parentOrigin, allowedOrigins)) {
      return { allowed: false, reason: `Parent origin ${parentOrigin} not in allowed origins` };
    }
    
    return { allowed: true };
  } else {
    // For direct API requests, validate the origin normally
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return { allowed: false, reason: `Origin ${origin} not in allowed origins` };
    }
    
    return { allowed: true };
  }
}

/**
 * CORS headers for widget endpoints
 */
export function getCORSHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Origin',
    'Vary': 'Origin',
  };

  // Set specific origin if allowed, never use wildcard for security
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'false'; // We use Bearer tokens, not cookies
  }

  return headers;
}

/**
 * Rate limiting key generator
 */
export function getRateLimitKey(siteId: string, ip: string): string {
  return `widget:${siteId}:${ip}`;
}

/**
 * Simple in-memory rate limiter (replace with Redis in production)
 */
class InMemoryRateLimiter {
  private requests = new Map<string, { count: number; resetAt: number }>();

  isAllowed(key: string, limit: number, windowMs: number = 60000): boolean {
    const now = Date.now();
    const entry = this.requests.get(key);

    // Clean up expired entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean up
      this.cleanup(now);
    }

    if (!entry || now >= entry.resetAt) {
      // First request or window expired
      this.requests.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (entry.count >= limit) {
      return false; // Rate limit exceeded
    }

    entry.count++;
    return true;
  }

  private cleanup(now: number) {
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetAt) {
        this.requests.delete(key);
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();