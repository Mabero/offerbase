import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { cache } from '@/lib/cache';

export interface SiteConfig {
  id: string;
  allowed_origins: string[];
  widget_enabled: boolean;
  widget_rate_limit_per_minute: number;
  chat_settings?: Array<{
    chat_name?: string;
    chat_color?: string;
    chat_icon_url?: string;
    chat_name_color?: string;
    chat_bubble_icon_color?: string;
    input_placeholder?: string;
    font_size?: string;
    intro_message?: string;
  }> | null;
}

function normalizeOrigins(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter(Boolean).map(String);
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      // single origin string fallback
      return [input];
    }
  }
  return [];
}

/**
 * Fetch and cache per-site configuration used by hot endpoints.
 * TTL kept modest to respect dashboard changes while avoiding repeated reads.
 */
export async function getSiteConfig(
  supabase: SupabaseClient | null,
  siteId: string,
  includeChatSettings: boolean = false,
  ttlSeconds: number = 600
): Promise<SiteConfig | null> {
  if (!siteId) return null;

  const key = `sitecfg:${siteId}:${includeChatSettings ? 'withcs' : 'nocs'}`;
  const cached = await cache.get<SiteConfig>(key);
  if (cached) return cached;

  const client: SupabaseClient =
    supabase || createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const select = includeChatSettings
    ? `id, allowed_origins, widget_enabled, widget_rate_limit_per_minute, chat_settings (chat_name, chat_color, chat_icon_url, chat_name_color, chat_bubble_icon_color, input_placeholder, font_size, intro_message)`
    : 'id, allowed_origins, widget_enabled, widget_rate_limit_per_minute';

  const { data, error } = await client
    .from('sites')
    .select(select)
    .eq('id', siteId)
    .single();

  if (error || !data) {
    return null;
  }

  const cfg: SiteConfig = {
    id: data.id,
    allowed_origins: normalizeOrigins((data as any).allowed_origins),
    widget_enabled: Boolean((data as any).widget_enabled),
    widget_rate_limit_per_minute: Number((data as any).widget_rate_limit_per_minute || 60),
    chat_settings: (data as any).chat_settings ?? null,
  };

  await cache.set(key, cfg, ttlSeconds);
  return cfg;
}

