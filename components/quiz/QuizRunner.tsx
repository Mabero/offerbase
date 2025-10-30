"use client";

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { QuizDefinition, QuizNode, QuestionNode, OutcomeNode } from '@/lib/quiz/types';
import { compileConstraints, nextNode } from '@/lib/quiz/engine';

export interface QuizRunnerProps {
  definition: QuizDefinition;
  locale?: string;
  apiUrl: string;
  siteId: string;
  widgetToken: string | null;
  chatColor?: string;
  pageUrl?: string;
  onComplete?: (payload: { query: string; contextKeywords: string[]; why: string[] }) => void;
}

const getText = (map: Record<string, string> | undefined, locale?: string): string => {
  if (!map) return '';
  if (locale && map[locale]) return map[locale];
  const first = Object.values(map)[0];
  return first || '';
};

function isQuestion(node: QuizNode): node is QuestionNode { return node.type === 'question'; }
function isOutcome(node: QuizNode): node is OutcomeNode { return node.type === 'outcome'; }

export default function QuizRunner({ definition, locale, apiUrl, siteId, widgetToken, chatColor = '#000', pageUrl, onComplete }: QuizRunnerProps) {
  const startId = definition.start;
  const nodesById = useMemo(() => Object.fromEntries(definition.nodes.map(n => [n.id, n])), [definition]);
  const [currentId, setCurrentId] = useState<string>(startId);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [done, setDone] = useState(false);
  const [offer, setOffer] = useState<any | null>(null);
  const [reason, setReason] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const current = nodesById[currentId];

  const submitAndNext = useCallback((answerPayload: any) => {
    const nextAnswers = { ...answers, [currentId]: answerPayload };
    setAnswers(nextAnswers);
    const nxt = nextNode(definition, currentId, nextAnswers);
    if (!nxt) {
      // Terminal; compile constraints and fetch recommendation
      const compiled = compileConstraints(definition, nextAnswers);
      setDone(true);
      setLoading(true);
      // Fire analytics (best-effort; no blocking)
      try {
        fetch(`${apiUrl}/api/analytics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'quiz_complete', site_id: siteId, details: { pageUrl, query: compiled.query, why: compiled.why } }) }).catch(() => {});
      } catch {}
      // Allow parent hook
      onComplete?.(compiled);
      if (compiled.query && widgetToken) {
        fetch(`${apiUrl}/api/offers/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${widgetToken}` },
          body: JSON.stringify({ query: compiled.query, limit: 3, contextKeywords: compiled.contextKeywords })
        })
          .then(r => r.json())
          .then(data => {
            const top = Array.isArray(data?.data) && data.data.length > 0 ? data.data[0] : null;
            setOffer(top);
            setReason(compiled.why[0] || '');
          })
          .catch(() => { setOffer(null); })
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    } else {
      setCurrentId(nxt);
    }
  }, [answers, currentId, definition, apiUrl, siteId, widgetToken, pageUrl, onComplete]);

  useEffect(() => {
    // quiz_start analytics
    try { fetch(`${apiUrl}/api/analytics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'quiz_start', site_id: siteId, details: { pageUrl } }) }).catch(() => {}); } catch {}
  }, [apiUrl, siteId, pageUrl]);

  if (!current || done) {
    return (
      <div style={{ margin: '8px 0 16px 0' }}>
        {loading && (
          <div style={{ color: '#6b7280', fontSize: 14 }}>Finding the best match…</div>
        )}
        {!loading && offer && (
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 4px 10px rgba(0,0,0,0.06)'
          }}>
            <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>Recommended</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{offer.title}</div>
            {reason && <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>Why: {reason}</div>}
            <a href={offer.url} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block',
              backgroundColor: chatColor,
              color: 'white',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              textDecoration: 'none'
            }}>{offer.button_text || 'Learn more'}</a>
          </div>
        )}
      </div>
    );
  }

  // Question rendering
  if (isQuestion(current)) {
    const q = current;
    const question = getText(q.question, locale);
    const kind = q.ui.kind;
    const chatBorder = `1px solid rgba(0,0,0,0.06)`;
    const optionStyle: React.CSSProperties = {
      border: chatBorder,
      borderRadius: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      background: 'white'
    };

    const onSelectSingle = (optId: string) => submitAndNext([optId]);
    const onToggleMulti = (optId: string) => {
      const existing: string[] = answers[q.id] || [];
      const set = new Set(existing);
      if (set.has(optId)) set.delete(optId); else set.add(optId);
      setAnswers(a => ({ ...a, [q.id]: Array.from(set) }));
    };
    const onSubmitMulti = () => submitAndNext(answers[q.id] || []);
    const onSubmitRange = (v: number) => submitAndNext(v);
    const onSubmitInput = (v: string) => submitAndNext(v.trim());

    return (
      <div style={{ margin: '8px 0 16px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{question}</div>
        {kind === 'single' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(q.options || []).map(o => (
              <button key={o.id} style={optionStyle} onClick={() => onSelectSingle(o.id)}>
                {getText(o.label, locale)}
              </button>
            ))}
          </div>
        )}
        {kind === 'multi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(q.options || []).map(o => {
              const selected = (answers[q.id] || []).includes(o.id);
              return (
                <label key={o.id} style={{ ...optionStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={selected} onChange={() => onToggleMulti(o.id)} />
                  <span>{getText(o.label, locale)}</span>
                </label>
              );
            })}
            <div>
              <button onClick={onSubmitMulti} style={{
                backgroundColor: chatColor, color: 'white', padding: '8px 12px', borderRadius: 8, border: 'none'
              }}>Continue</button>
            </div>
          </div>
        )}
        {kind === 'range' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="range" min={q.ui.min ?? 0} max={q.ui.max ?? 100} step={q.ui.step ?? 1} defaultValue={q.ui.min ?? 0} onChange={(e) => setAnswers(a => ({ ...a, [q.id]: Number(e.target.value) }))} />
            <button onClick={() => onSubmitRange(Number(answers[q.id] ?? q.ui.min ?? 0))} style={{ backgroundColor: chatColor, color: 'white', padding: '8px 12px', borderRadius: 8, border: 'none' }}>Continue</button>
          </div>
        )}
        {kind === 'input' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder={getText(q.ui.placeholder, locale)} onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} style={{ flex: 1, border: chatBorder, borderRadius: 8, padding: '8px 10px' }} />
            <button onClick={() => onSubmitInput(String(answers[q.id] || ''))} style={{ backgroundColor: chatColor, color: 'white', padding: '8px 12px', borderRadius: 8, border: 'none' }}>Continue</button>
          </div>
        )}
      </div>
    );
  }

  if (isOutcome(current)) {
    const msg = getText(current.message, locale) || '';
    // Finalize with strict outcome if present; otherwise compile effects and fetch
    if (!done) {
      const out = current.outcome || {};
      const conclude = async () => {
        setDone(true);
        setLoading(true);
        try {
          // Analytics
          fetch(`${apiUrl}/api/analytics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'quiz_complete', site_id: siteId, details: { pageUrl, message: msg || undefined } }) }).catch(() => {});
        } catch {}

        // Strict outcome: show selected offer snapshot immediately
        if (out.offer && out.offer.id) {
          setOffer({
            id: out.offer.id,
            title: out.offer.title,
            url: out.offer.url,
            image_url: out.offer.image_url || null,
            button_text: out.offer.button_text || 'Learn more',
          });
          setReason(reason || '');
          setLoading(false);
          onComplete?.({ query: '', contextKeywords: [], why: reason ? [reason] : [] });
          return;
        }

        // Dynamic outcome via effects + answers
        const compiled = compileConstraints({ ...definition, mappings: definition.mappings }, answers);
        if (out.effects) {
          // Merge outcome effects as final step
          const merged = compileConstraints({ ...definition, mappings: [{ when: {}, effects: out.effects }] as any }, answers);
          compiled.query = [compiled.query, merged.query].filter(Boolean).join(' ').trim();
          compiled.contextKeywords = Array.from(new Set([...(compiled.contextKeywords || []), ...(merged.contextKeywords || [])]));
          compiled.why = [...(compiled.why || []), ...(merged.why || [])];
        }
        setReason(compiled.why[0] || msg || '');
        onComplete?.(compiled);
        if (compiled.query && widgetToken) {
          try {
            const r = await fetch(`${apiUrl}/api/offers/match`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${widgetToken}` },
              body: JSON.stringify({ query: compiled.query, limit: 3, contextKeywords: compiled.contextKeywords })
            });
            const data = await r.json();
            const top = Array.isArray(data?.data) && data.data.length > 0 ? data.data[0] : null;
            setOffer(top);
          } catch {
            setOffer(null);
          } finally {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      };
      // Start finalize (avoid state changes during render)
      setTimeout(conclude, 0);
    }
    return (
      <div style={{ margin: '8px 0 16px 0', color: '#6b7280' }}>{msg}</div>
    );
  }

  return null;
}
