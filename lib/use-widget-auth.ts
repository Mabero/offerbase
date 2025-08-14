/**
 * React hook for widget authentication management
 * Handles JWT token bootstrap, storage, and automatic refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

export interface UseWidgetAuthReturn {
  config: WidgetConfig | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Widget authentication hook
 * Automatically bootstraps and manages JWT tokens for secure API access
 */
export function useWidgetAuth(siteId: string, apiUrl: string, parentOrigin?: string | null): UseWidgetAuthReturn {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Bootstrap widget authentication
  const bootstrap = useCallback(async (): Promise<WidgetConfig | null> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('🔐 Bootstrapping widget authentication for site:', siteId);

      // Build URL with parent origin if provided
      let bootstrapUrl = `${apiUrl}/api/widget/bootstrap?siteId=${encodeURIComponent(siteId)}`;
      if (parentOrigin) {
        bootstrapUrl += `&parentOrigin=${encodeURIComponent(parentOrigin)}`;
      }
      
      const response = await fetch(bootstrapUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'omit' // Don't send cookies, we use JWT tokens
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Bootstrap failed: ${response.status} ${response.statusText}`);
      }

      const widgetConfig: WidgetConfig = await response.json();
      console.log('✅ Widget authentication successful, token expires at:', new Date(widgetConfig.expiresAt));

      setConfig(widgetConfig);
      scheduleRefresh(widgetConfig.expiresAt);
      
      return widgetConfig;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Bootstrap failed';
      console.error('❌ Widget bootstrap failed:', errorMessage);
      setError(errorMessage);
      setConfig(null);
      
      // Don't auto-retry, let user refresh if needed
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [siteId, apiUrl, parentOrigin]); // Removed config to prevent re-render loops

  // Schedule token refresh before expiration
  const scheduleRefresh = useCallback((expiresAt: number) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Refresh 2 minutes before expiration, or immediately if already expired
    const refreshAt = Math.max(expiresAt - (2 * 60 * 1000), Date.now() + 1000);
    const delay = refreshAt - Date.now();

    console.log(`⏱️  Scheduling token refresh in ${Math.round(delay / 1000)} seconds`);

    refreshTimeoutRef.current = setTimeout(() => {
      console.log('🔄 Auto-refreshing widget token');
      bootstrap();
    }, delay);
  }, [bootstrap]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    await bootstrap();
  }, [bootstrap]);

  // Initialize authentication on mount
  useEffect(() => {
    if (!siteId || !apiUrl) {
      setError('siteId and apiUrl are required');
      setIsLoading(false);
      return;
    }

    // Only bootstrap once on mount, not on every render
    let mounted = true;
    
    const initBootstrap = async () => {
      if (mounted && !config) {
        await bootstrap();
      }
    };
    
    initBootstrap();

    // Cleanup on unmount
    return () => {
      mounted = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [siteId, apiUrl]); // Remove bootstrap from dependencies

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  return {
    config,
    token: config?.token || null,
    isAuthenticated: !!(config?.token && config.expiresAt > Date.now()),
    isLoading,
    error,
    refresh
  };
}

/**
 * Authenticated fetch wrapper for widget API calls
 * Automatically includes Bearer token and handles 401 errors with token refresh
 */
export async function authenticatedFetch(
  url: string, 
  options: RequestInit,
  token: string,
  onTokenExpired?: () => Promise<void>
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Handle token expiration
  if (response.status === 401 && onTokenExpired) {
    console.log('🔄 Token expired, attempting refresh');
    await onTokenExpired();
    
    // Note: In practice, you'd want to retry the original request with the new token
    // For simplicity, we're just triggering the refresh here
    // The calling code should handle retry logic
  }

  return response;
}