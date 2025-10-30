import { QuizTargeting, TargetingRule } from './types';

function matchSubstring(url: string, pattern: string): boolean {
  try {
    const normUrl = new URL(url);
    const full = normUrl.href.toLowerCase();
    const p = pattern.toLowerCase();
    return full.includes(p) || normUrl.pathname.toLowerCase().includes(p) || normUrl.hostname.toLowerCase().includes(p);
  } catch {
    const full = String(url || '').toLowerCase();
    return full.includes((pattern || '').toLowerCase());
  }
}

function matchRegex(url: string, pattern: string): boolean {
  try {
    const rx = new RegExp(pattern, 'i');
    return rx.test(url);
  } catch {
    return false;
  }
}

function matchRule(url: string, rule: TargetingRule): boolean {
  if (!rule || !rule.pattern) return false;
  return rule.type === 'regex' ? matchRegex(url, rule.pattern) : matchSubstring(url, rule.pattern);
}

export function matchesUrlTargeting(url: string, targeting?: QuizTargeting | null): boolean {
  if (!targeting) return true; // no targeting => site-wide
  const ex = targeting.exclude || [];
  if (ex.some(r => matchRule(url, r))) return false;
  const inc = targeting.include || [];
  if (inc.length === 0) return true; // only excludes defined => site-wide except excludes
  return inc.some(r => matchRule(url, r));
}

