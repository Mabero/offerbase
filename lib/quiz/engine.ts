import { CompiledConstraints, Condition, Effects, MappingRule, QuizDefinition } from './types';

function evalCondition(cond: Condition, answers: Record<string, any>): boolean {
  const value = answers[cond.nodeId];
  // Option selections are normalized as arrays of option ids for single/multi; numbers for range/input
  if (Array.isArray(value)) {
    const set = new Set<string>(value);
    if (cond.anyOf && cond.anyOf.some(id => set.has(id))) return true;
    if (cond.allOf && cond.allOf.every(id => set.has(id))) return true;
    if (cond.not && cond.not.some(id => set.has(id))) return false;
    // If only NOT provided, treat absence as pass
    if (cond.not && !cond.anyOf && !cond.allOf) return true;
    return false;
  }
  if (typeof value === 'number') {
    if (typeof cond.gte === 'number' && value < cond.gte) return false;
    if (typeof cond.lte === 'number' && value > cond.lte) return false;
    return true;
  }
  return false;
}

function all(conds: Condition[] | undefined, answers: Record<string, any>): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.every(c => evalCondition(c, answers));
}

function any(conds: Condition[] | undefined, answers: Record<string, any>): boolean {
  if (!conds || conds.length === 0) return true;
  return conds.some(c => evalCondition(c, answers));
}

export function nextNode(def: QuizDefinition, currentId: string, answers: Record<string, any>): string | null {
  const edges = def.edges.filter(e => e.from === currentId);
  for (const e of edges) {
    const passAll = all(e.when?.all, answers);
    const passAny = any(e.when?.any, answers);
    if (passAll && passAny) return e.to;
  }
  return null;
}

function mergeEffects(base: Effects, add?: Effects): Effects {
  if (!add) return base;
  return {
    must: Array.from(new Set([...(base.must || []), ...(add.must || [])])),
    should: Array.from(new Set([...(base.should || []), ...(add.should || [])])),
    exclude: Array.from(new Set([...(base.exclude || []), ...(add.exclude || [])])),
    weights: { ...(base.weights || {}), ...(add.weights || {}) },
    ranges: { ...(base.ranges || {}), ...(add.ranges || {}) },
  };
}

function applyMappings(mappings: MappingRule[] | undefined, answers: Record<string, any>): { effects: Effects; why: string[] } {
  const agg: Effects = {};
  const why: string[] = [];
  if (!mappings || mappings.length === 0) return { effects: agg, why };
  for (const m of mappings) {
    const passAll = all(m.when?.all, answers);
    const passAny = any(m.when?.any, answers);
    if (passAll && passAny) {
      Object.assign(agg, mergeEffects(agg, m.effects));
      // Explanation text will be handled by caller based on locale; store placeholder keys now
      if (m.explain) {
        const first = Object.values(m.explain)[0];
        if (first) why.push(first);
      }
    }
  }
  return { effects: agg, why };
}

export function compileConstraints(def: QuizDefinition, answers: Record<string, any>): CompiledConstraints {
  // Accumulate effects from selected options (direct) + mappings (global)
  let effects: Effects = {};
  const why: string[] = [];

  // Direct effects from options
  for (const node of def.nodes) {
    if (node.type !== 'question') continue;
    const sel = answers[node.id];
    if (!sel) continue;
    if (Array.isArray(sel)) {
      const selectedOptions = (node.options || []).filter(o => sel.includes(o.id));
      selectedOptions.forEach(o => {
        effects = mergeEffects(effects, o.effects);
        if (o.explain) {
          const first = Object.values(o.explain)[0];
          if (first) why.push(first);
        }
      });
    } else if (typeof sel === 'number') {
      // Range/input numeric answers can be mapped via mappings/ranges
      // Nothing to do here; covered by mappings
    }
  }

  const mapped = applyMappings(def.mappings, answers);
  effects = mergeEffects(effects, mapped.effects);
  why.push(...mapped.why);

  // Build a deterministic query and context keywords
  const terms: string[] = [];
  (effects.must || []).forEach(t => terms.push(t));
  (effects.should || []).forEach(t => terms.push(t));
  // Lightweight encoding for numeric ranges (e.g., budget)
  Object.entries(effects.ranges || {}).forEach(([k, r]) => {
    const parts: string[] = [];
    if (typeof r.min === 'number') parts.push(`${k}>=${r.min}`);
    if (typeof r.max === 'number') parts.push(`${k}<=${r.max}`);
    if (parts.length) terms.push(parts.join(' '));
  });

  const query = terms.join(' ').trim();
  const contextKeywords = Array.from(new Set(terms.map(t => String(t).toLowerCase()).filter(Boolean)));
  return { query, contextKeywords, why };
}

