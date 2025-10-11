import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  createSiteToken, 
  getRequestOrigin, 
  isOriginAllowed,
  isWidgetRequestAllowed, 
  getCORSHeaders,
  rateLimiter,
  getRateLimitKey,
  type WidgetConfig 
} from '@/lib/widget-auth';
import { getSiteConfig } from '@/lib/site-config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = getRequestOrigin(request);
  
  return new NextResponse(null, {
    status: 200,
    headers: getCORSHeaders(origin, ['*']) // Allow all origins for OPTIONS
  });
}

/**
 * Bootstrap endpoint for widget initialization
 * GET /api/widget/bootstrap?siteId=X
 * 
 * Validates origin, returns widget config + short-lived JWT token
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const parentOrigin = searchParams.get('parentOrigin');
    const origin = getRequestOrigin(request);

    // Validate required parameters
    if (!siteId) {
      return NextResponse.json(
        { error: 'siteId parameter is required' }, 
        { 
          status: 400,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    if (!origin) {
      return NextResponse.json(
        { error: 'Origin header is required for security' }, 
        { 
          status: 400,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    '127.0.0.1';

    // Fetch site configuration (cached)
    const site = await getSiteConfig(supabase, siteId, true);
    if (!site || !site.widget_enabled) {
      console.warn(`Bootstrap failed: site not found or disabled`, { siteId });
      return NextResponse.json(
        { error: 'Site not found or widget disabled' }, 
        { 
          status: 404,
          headers: getCORSHeaders(origin, [])
        }
      );
    }

    // Validate origin against site's allowed origins
    // Defensive parsing - handles both array and string formats from database
    const allowedOrigins: string[] = site.allowed_origins || [];
    // Validate request using dual-origin validation
    const validationResult = isWidgetRequestAllowed(origin, parentOrigin, allowedOrigins);
    if (!validationResult.allowed) {
      console.error(`🚫 Bootstrap failed: ${validationResult.reason}`, { 
        siteId, 
        providedOrigin: origin,
        parentOrigin,
        allowedOrigins,
        rawOriginHeader: request.headers.get('origin'),
        rawRefererHeader: request.headers.get('referer'),
        userAgent: request.headers.get('user-agent'),
        validationReason: validationResult.reason
      });
      
      return NextResponse.json(
        { error: validationResult.reason || 'Origin not allowed for this site' }, 
        { 
          status: 403,
          headers: getCORSHeaders(origin, allowedOrigins)
        }
      );
    }

    // Apply rate limiting (bootstrap requests) - skip for localhost development
    const rateLimitKey = getRateLimitKey(`bootstrap:${siteId}`, clientIP);
    const bootstrapRateLimit = 20; // 20 bootstrap requests per minute max
    
    // Skip rate limiting for localhost development
    const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1');
    
    if (!isLocalhost && !(await rateLimiter.isAllowed(rateLimitKey, bootstrapRateLimit, 60000))) {
      console.warn(`Bootstrap rate limited`, { siteId, origin, clientIP });
      
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before requesting a new token.' }, 
        { 
          status: 429,
          headers: {
            ...getCORSHeaders(origin, allowedOrigins),
            'Retry-After': '60'
          }
        }
      );
    }

    // Create JWT token with parent origin information
    const token = createSiteToken(siteId, origin, parentOrigin);
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

    // Prepare widget configuration
    const chatSettings = site.chat_settings?.[0] || {};
    const widgetConfig: WidgetConfig = {
      siteId,
      token,
      expiresAt,
      settings: {
        chat_name: chatSettings.chat_name || 'Affi',
        chat_color: chatSettings.chat_color || '#000000',
        chat_icon_url: chatSettings.chat_icon_url || '',
        chat_name_color: chatSettings.chat_name_color || '#FFFFFF',
        chat_bubble_icon_color: chatSettings.chat_bubble_icon_color || '#FFFFFF',
        input_placeholder: chatSettings.input_placeholder || 'Type your message...',
        font_size: chatSettings.font_size || '14px',
        intro_message: chatSettings.intro_message || 'Hello! How can I help you today?'
      }
    };

    // Log successful bootstrap for observability
    console.log(`✅ Widget bootstrap successful`, {
      siteId,
      origin,
      parentOrigin,
      allowedOrigins,
      rawOriginHeader: request.headers.get('origin'),
      rawRefererHeader: request.headers.get('referer'),
      clientIP: clientIP.substring(0, 8) + '...', // Partial IP for privacy
      responseTime: Date.now() - startTime
    });

    return NextResponse.json(widgetConfig, {
      headers: {
        ...getCORSHeaders(origin, allowedOrigins),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Widget bootstrap error:', error);
    
    const origin = getRequestOrigin(request);
    return NextResponse.json(
      { error: 'Internal server error during bootstrap' }, 
      { 
        status: 500,
        headers: getCORSHeaders(origin, [])
      }
    );
  }
}
