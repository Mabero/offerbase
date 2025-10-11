import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Utilities to keep the stateless offers system in sync with affiliate_links.
 * Called from the dashboard write paths so the widget can match via offers immediately.
 */

export interface SyncInput {
  siteId: string;
  title: string;
  url: string;
  description?: string | null;
  manualAliases?: string[]; // optional aliases to copy into offer_aliases as 'manual'
}

export async function getServiceClient(): Promise<SupabaseClient> {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Ensure an offer exists for the provided affiliate_link data.
 * - Reuse existing offer for the same site + title if present
 * - Otherwise insert a new offer (brand/model left null)
 * - Optionally copy provided aliases into offer_aliases as manual
 */
export async function syncAffiliateToOffer(
  supabase: SupabaseClient,
  { siteId, title, url, description, manualAliases }: SyncInput
): Promise<{ offerId: string | null }> {
  try {
    // Try to find existing offer by site + exact title
    const { data: existing, error: findErr } = await supabase
      .from('offers')
      .select('id')
      .eq('site_id', siteId)
      .eq('title', title)
      .limit(1);

    if (findErr) {
      // Non-fatal, proceed to insert
    }

    let offerId: string | null = existing && existing.length ? existing[0].id : null;

    if (!offerId) {
      // Insert new offer
      const { data: inserted, error: insErr } = await supabase
        .from('offers')
        .insert([{ site_id: siteId, title: title.trim(), url: url.trim(), description: (description || '').trim() }])
        .select('id')
        .single();

      if (insErr) {
        // If a concurrent insert happened, try to re-fetch
        const { data: again } = await supabase
          .from('offers')
          .select('id')
          .eq('site_id', siteId)
          .eq('title', title)
          .limit(1);
        offerId = again && again.length ? again[0].id : null;
      } else {
        offerId = inserted?.id ?? null;
      }
    } else {
      // Keep URL/description in sync (non-destructive update)
      await supabase
        .from('offers')
        .update({ url: url.trim(), description: (description || '').trim() })
        .eq('id', offerId);
    }

    if (offerId && manualAliases && manualAliases.length) {
      // Insert aliases as manual; ignore duplicates
      const rows = manualAliases
        .map(a => (a || '').trim())
        .filter(Boolean)
        .map(alias => ({ offer_id: offerId!, site_id: siteId, alias, alias_type: 'manual' as const }));

      if (rows.length) {
        // Use upsert to avoid hard errors on duplicates; conflict on (offer_id, alias_norm)
        // alias_norm is generated, but Postgres will still use it in the conflict target
        try {
          // @ts-ignore - onConflict accepts a string target
          await supabase.from('offer_aliases').upsert(rows, { onConflict: 'offer_id,alias_norm' });
        } catch (_e) {
          // Fallback: best-effort insert ignoring unique constraint errors
          await supabase.from('offer_aliases').insert(rows).then(({ error }) => {
            if (error && String(error.code) !== '23505') {
              // log and continue
              console.warn('offer_aliases insert error:', error);
            }
          });
        }
      }
    }

    return { offerId };
  } catch (e) {
    console.error('syncAffiliateToOffer failed:', e);
    return { offerId: null };
  }
}

