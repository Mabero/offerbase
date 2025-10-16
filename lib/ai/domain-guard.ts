import { createClient } from '@supabase/supabase-js';
import { getCacheKey, getCachedData, cache } from '@/lib/cache';

// TTL for derived domain terms (seconds)
const TTL_SECONDS = 15 * 60; // 15 minutes

// Very small multilingual stopword list + generic noise to avoid topic drift
const STOPWORDS = new Set<string>([
  // English
  'the','and','for','are','but','not','you','all','can','has','have','had','her','his','its','our','out','get','new','now','see','two','way','who','did','let','put','say','she','too','use','with','from','this','that','these','those','there','here','about','into','onto','your','their','more','most','less','least','very','some','any','each','other','only','also','just','than','then','when','what','which','why','how','where','who','whom','will','shall','should','would','could','may','might','must','do','does','did','done','a','an','of','to','in','on','at','by','as','it','is','be','was','were','been','or','if','so','no','yes','ok','okay',
  // Norwegian (Bokmål common)
  'og','i','jeg','det','at','en','et','den','til','er','som','på','de','med','han','av','ikke','der','så','var','meg','seg','men','ett','har','om','vi','min','mitt','ha','hadde','hun','nå','over','da','ved','fra','du','ut','sin','dem','oss','opp','man','mot','å','var','deg','kan','kun','kom','noe','ved','ville','skal','skulle','kunne','dette','disse','hva','hvor','hvem','hvorfor','hvordan','når','hvilken','hvilke','hvilket','eller','både','enten','hverken','altså','sånn','slik',
  // Generic evaluative/commercial noise (EN/NO)
  'best','top','vs','review','reviews','price','prices','cost','cheap','expensive','budget','buy','deal','offers','guide','usage','use','free','trial','demo','rank','ranking','compare','comparison','pros','cons','benefits','drawbacks','latest','new','update',
  'beste','topp','anmeldelse','anmeldelser','pris','priser','kostnad','billig','dyr','budsjett','kjøp','tilbud','guide','bruk','gratis','prøve','demonstrasjon','sammenlign','sammenligning','fordeler','ulemper','oppdatert','ny'
]);

function norm(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\p{Diacritic}]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  const parts = norm(text).split(' ');
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (p.length < 3) continue;
    if (STOPWORDS.has(p)) continue;
    // Drop pure numbers and common years
    if (/^\d+$/.test(p)) continue;
    if (/^(19|20)\d{2}$/.test(p)) continue;
    out.push(p);
  }
  return out;
}

function isNoiseTerm(t: string): boolean {
  if (!t) return true;
  if (STOPWORDS.has(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^(19|20)\d{2}$/.test(t)) return true; // years
  const months = new Set([
    'january','february','march','april','may','june','july','august','september','october','november','december',
    'januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'
  ]);
  if (months.has(t)) return true;
  return false;
}

function isShortModelCode(t: string): boolean {
  // Accept short alphanumeric codes like g4, x90, 90x; max length 6
  const s = t.toLowerCase();
  if (s.length > 6) return false;
  return /^(?:[a-z]{1,2}\d{1,3}|\d{1,3}[a-z]{1,2})$/.test(s);
}

function containsYearAnywhere(s: string): boolean {
  return /(19|20)\d{2}/.test(s);
}

function uniquePush(set: Set<string>, value?: string | null) {
  if (!value) return;
  const v = norm(value);
  if (!v) return;
  // Accept multiword terms and single tokens >=3 chars
  if (v.length >= 3) set.add(v);
}

export async function getSiteDomainTerms(siteId: string): Promise<string[]> {
  const cacheKey = getCacheKey(siteId, 'domain_terms');
  return await getCachedData<string[]>(cacheKey, async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const terms = new Set<string>();
    const brandSingles = new Set<string>(); // allow safe single-token brand terms

    // 1) Training materials: intent_keywords and primary_products
    try {
      const { data: tms } = await supabase
        .from('training_materials')
        .select('intent_keywords, primary_products, structured_data')
        .eq('site_id', siteId)
        .eq('scrape_status', 'success')
        .limit(500);
      (tms || []).forEach((tm: any) => {
        (tm.intent_keywords || []).forEach((kw: string) => {
          const n = norm(kw);
          if (!n || isNoiseTerm(n)) return;
          // Prefer multiword phrases or model-like tokens
          if (n.includes(' ') || /\d/.test(n)) terms.add(n);
          else if (n.length >= 4) terms.add(n);
        });
        (tm.primary_products || []).forEach((pp: string) => {
          const n = norm(pp);
          if (!n || isNoiseTerm(n)) return;
          terms.add(n);
        });
        const sd = tm.structured_data || {};
        const cat = typeof sd.category === 'string' ? norm(sd.category) : '';
        if (cat && !isNoiseTerm(cat)) terms.add(cat);
        // brand_terms and model_codes if summarized stored there
        if (Array.isArray(sd.brand_terms)) {
          for (const b of sd.brand_terms) {
            const n = norm(String(b));
            if (n && !isNoiseTerm(n)) { terms.add(n); brandSingles.add(n); }
          }
        }
        if (Array.isArray(sd.model_codes)) {
          for (const m of sd.model_codes) {
            const n = norm(String(m));
            if (n && !isNoiseTerm(n)) terms.add(n);
          }
        }
      });
    } catch {}

    // 2) Offers: brand_norm, model_norm, title_norm
    try {
      const { data: offers } = await supabase
        .from('offers')
        .select('brand_norm, model_norm, title_norm')
        .eq('site_id', siteId)
        .limit(500);
      (offers || []).forEach((o: any) => {
        const b = norm(o.brand_norm || '');
        const m = norm(o.model_norm || '');
        if (b && !isNoiseTerm(b)) { terms.add(b); brandSingles.add(b); }
        if (m && !isNoiseTerm(m)) terms.add(m);
        // Tokenize title_norm and add safe tokens (>=3 chars, stopword-filtered)
        const t = norm(o.title_norm || '');
        if (t) {
          const toks = tokenize(t);
          for (const tok of toks) {
            if (!tok) continue;
            if (!isNoiseTerm(tok)) terms.add(tok);
          }
        }
      });
    } catch {}

    // 3) Offer aliases (alias_norm)
    try {
      const { data: aliases } = await supabase
        .from('offer_aliases')
        .select('alias_norm, alias_type')
        .eq('site_id', siteId)
        .in('alias_type', ['brand_model','model_only','brand_only'])
        .limit(1000);
      (aliases || []).forEach((a: any) => {
        const n = norm(a.alias_norm || '');
        if (!n || isNoiseTerm(n)) return;
        if (n.includes(' ') || /\d/.test(n)) terms.add(n);
        else { terms.add(n); brandSingles.add(n); }
      });
    } catch {}

    // No heuristic fallback: if AI fields are missing, return empty set and let guard refuse.
    if (terms.size === 0) {
      console.warn(`[DomainGuard] No derived terms for site ${siteId}. Guard will refuse off-topic until summaries exist.`);
    }

    // Final filtering: prefer multiword phrases, model codes, and approved brand singles
    const out: string[] = [];
    for (const raw of terms) {
      const t = raw.trim();
      if (!t || isNoiseTerm(t)) continue;
      if (containsYearAnywhere(t)) continue;

      if (t.includes(' ')) {
        // Multi-word: reject if any token contains digits and isn't a short model code
        const toks = t.split(/\s+/);
        let ok = true;
        for (const tok of toks) {
          if (/\d/.test(tok)) {
            const w = tok.replace(/[^\p{L}\p{N}]/gu, '');
            if (!isShortModelCode(w) && !brandSingles.has(w)) { ok = false; break; }
          }
        }
        if (!ok) continue;
        out.push(t);
        continue;
      }

      // Single token
      if (/\d/.test(t)) {
        const w = t.replace(/[^\p{L}\p{N}]/gu, '');
        if (brandSingles.has(w) || isShortModelCode(w)) { out.push(w); }
        continue;
      }
      if (brandSingles.has(t) || t.length >= 3) { out.push(t); }
    }

    return out.slice(0, 1000).sort();
  }, TTL_SECONDS);
}

export function isInDomain(query: string, domainTerms: string[]): boolean {
  if (!domainTerms || domainTerms.length === 0) return false;
  const qNorm = norm(query);
  if (!qNorm) return false;

  // Quick token check
  const qTokens = new Set<string>(tokenize(qNorm));

  for (const term of domainTerms) {
    const t = term.trim();
    if (!t) continue;
    // Multi-word: substring check
    if (t.includes(' ')) {
      if (qNorm.includes(t)) return true;
    } else {
      if (qTokens.has(t)) return true;
    }
  }
  return false;
}

// Debug utility: return which terms matched the query
export function matchDomainTerms(query: string, domainTerms: string[], maxMatches: number = 50): string[] {
  const qNorm = norm(query || '');
  if (!qNorm || !domainTerms?.length) return [];
  const qTokens = new Set<string>(tokenize(qNorm));
  const matches: string[] = [];
  for (const term of domainTerms) {
    if (!term) continue;
    if (term.includes(' ')) {
      if (qNorm.includes(term)) {
        matches.push(term);
      }
    } else if (qTokens.has(term)) {
      matches.push(term);
    }
    if (matches.length >= maxMatches) break;
  }
  return matches;
}

// Invalidate cached domain terms for a site (call on write paths)
export async function invalidateSiteDomainTerms(siteId: string): Promise<void> {
  try {
    const key = getCacheKey(siteId, 'domain_terms');
    await cache.del(key);
  } catch {}
}
