"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QuizDefinition, QuizRecord, QuizTargeting, QuizNode, QuestionNode, OutcomeNode } from '@/lib/quiz/types';

type AffiliateLink = { id: string; title: string; url: string; description?: string; image_url?: string | null; button_text?: string | null };

function uid(prefix: string, n: number) { return `${prefix}${n}`; }

function toLocaleMap(text: string) { return { default: text } as Record<string, string>; }

export default function QuizBuilder({ siteId }: { siteId: string }) {
  const featureEnabled = process.env.NEXT_PUBLIC_ENABLE_QUIZ_BUILDER === 'true';
  // List
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [editing, setEditing] = useState<QuizRecord | null>(null);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(0);
  const [status, setStatus] = useState<'draft'|'published'>('draft');
  const [includeRules, setIncludeRules] = useState<Array<{ type: 'substring'|'regex'; pattern: string }>>([]);
  const [excludeRules, setExcludeRules] = useState<Array<{ type: 'substring'|'regex'; pattern: string }>>([]);

  const [nodes, setNodes] = useState<QuizNode[]>([]);
  const [edges, setEdges] = useState<QuizDefinition['edges']>([]);
  const [startId, setStartId] = useState<string>('');

  // Offers for picker
  const [offers, setOffers] = useState<AffiliateLink[]>([]);
  const [offerQuery, setOfferQuery] = useState('');

  const filteredOffers = useMemo(() => {
    const q = offerQuery.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter(o => o.title.toLowerCase().includes(q));
  }, [offerQuery, offers]);

  const loadQuizzes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quizzes?siteId=${encodeURIComponent(siteId)}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setQuizzes(data.data || []);
    } catch {}
    setLoading(false);
  };

  const loadOffers = async () => {
    try {
      const res = await fetch(`/api/affiliate-links?siteId=${encodeURIComponent(siteId)}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setOffers(data.data || []);
    } catch {}
  };

  useEffect(() => { if (siteId) { loadQuizzes(); loadOffers(); } }, [siteId]);

  function resetForm() {
    setEditing(null);
    setName('');
    setPriority(0);
    setStatus('draft');
    setIncludeRules([]);
    setExcludeRules([]);
    setNodes([]);
    setEdges([]);
    setStartId('');
  }

  function addQuestion() {
    const idx = nodes.filter(n => n.type === 'question').length + 1;
    const id = uid('q', idx);
    const node: QuestionNode = { id, type: 'question', question: toLocaleMap('Your question'), ui: { kind: 'single' }, options: [] };
    setNodes(prev => [...prev, node]);
    if (!startId) setStartId(id);
  }

  function addOutcome() {
    const idx = nodes.filter(n => n.type === 'outcome').length + 1;
    const id = uid('o', idx);
    const node: OutcomeNode = { id, type: 'outcome', message: toLocaleMap('Thanks!') };
    setNodes(prev => [...prev, node]);
  }

  function updateNode<T extends QuizNode>(id: string, patch: Partial<T>) {
    setNodes(prev => prev.map(n => n.id === id ? ({ ...n, ...patch }) as QuizNode : n));
  }

  function removeNode(id: string) {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
    if (startId === id) setStartId(nodes.find(n => n.id !== id)?.id || '');
  }

  function addOption(q: QuestionNode) {
    const nextIndex = (q.options?.length || 0) + 1;
    const optId = `${q.id}_o${nextIndex}`;
    const newOpt = { id: optId, label: toLocaleMap(`Option ${nextIndex}`) } as NonNullable<QuestionNode['options']>[number];
    updateNode<QuestionNode>(q.id, { options: [...(q.options || []), newOpt] });
  }

  function updateOption(q: QuestionNode, optId: string, patch: Partial<NonNullable<QuestionNode['options']>[number]>) {
    const opts = (q.options || []).map(o => o.id === optId ? ({ ...o, ...patch }) : o);
    updateNode<QuestionNode>(q.id, { options: opts });
  }

  function removeOption(q: QuestionNode, optId: string) {
    const opts = (q.options || []).filter(o => o.id !== optId);
    updateNode<QuestionNode>(q.id, { options: opts });
    // Remove routed edge if any
    setEdges(prev => prev.filter(e => !(e.from === q.id && e.when && e.when.any && e.when.any.some(c => c.nodeId === q.id && c.anyOf?.includes(optId)))));
  }

  function setOptionRoute(q: QuestionNode, optId: string, toId: string | '') {
    // Remove existing route for this option
    setEdges(prev => prev.filter(e => !(e.from === q.id && e.when && e.when.any && e.when.any.some(c => c.nodeId === q.id && c.anyOf?.includes(optId)))));
    if (toId) {
      setEdges(prev => [{ from: q.id, to: toId, when: { any: [{ nodeId: q.id, anyOf: [optId] }] } }, ...prev]);
    }
  }

  function getOptionRoute(q: QuestionNode, optId: string): string {
    const e = edges.find(e => e.from === q.id && e.when && e.when.any && e.when.any.some(c => c.nodeId === q.id && c.anyOf?.includes(optId)));
    return e?.to || '';
  }

  function setOutcomeOffer(o: OutcomeNode, offer: AffiliateLink | null) {
    updateNode<OutcomeNode>(o.id, { outcome: offer ? { offerId: offer.id, offer: { id: offer.id, title: offer.title, url: offer.url, image_url: offer.image_url || null, button_text: offer.button_text || null } } : { offerId: undefined, offer: null } });
  }

  async function handleSave() {
    if (nodes.length === 0) {
      alert('Add at least one node before saving');
      return;
    }
    if (!startId) {
      alert('Choose a start node');
      return;
    }
    setSaving(true);
    try {
      const definition: QuizDefinition = { version: (editing?.version || 0) + 1, start: startId || (nodes[0]?.id || ''), nodes, edges, mappings: [] };
      const targeting: QuizTargeting = { include: includeRules, exclude: excludeRules };
      const payload = { siteId, name: name || 'Untitled quiz', status, priority: Number(priority) || 0, targeting, definition };
      let res: Response;
      if (editing) {
        res = await fetch(`/api/quizzes/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      } else {
        res = await fetch('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      }
      if (res.ok) {
        await loadQuizzes();
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  }

  function loadForEdit(q: QuizRecord) {
    setEditing(q);
    setName(q.name);
    setPriority(q.priority);
    setStatus(q.status);
    const t = (q.targeting || { include: [], exclude: [] }) as QuizTargeting;
    setIncludeRules(t.include || []);
    setExcludeRules(t.exclude || []);
    setNodes((q.definition?.nodes as any) || []);
    setEdges((q.definition?.edges as any) || []);
    setStartId(q.definition?.start || '');
  }

  async function handleDelete(q: QuizRecord) {
    if (!confirm('Delete this quiz?')) return;
    const res = await fetch(`/api/quizzes/${q.id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      await loadQuizzes();
      if (editing?.id === q.id) resetForm();
    }
  }

  if (!featureEnabled) {
    return (
      <Card>
        <CardHeader><CardTitle>Quiz Builder</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600">Feature disabled. Set NEXT_PUBLIC_ENABLE_QUIZ_BUILDER=true to enable.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Quiz Builder</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadQuizzes} disabled={loading}>Refresh</Button>
          <Button onClick={resetForm} variant="outline">New</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>{editing ? 'Edit Quiz' : 'Create Quiz'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My quiz" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} />
              </div>
              <div>
                <Label>Status</Label>
                <select className="border rounded px-2 py-1 w-full" value={status} onChange={e => setStatus(e.target.value as any)}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Targeting: include</Label>
              <RuleChips value={includeRules} onChange={setIncludeRules} />
            </div>
            <div>
              <Label>Targeting: exclude</Label>
              <RuleChips value={excludeRules} onChange={setExcludeRules} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Start node</Label>
              <select className="border rounded px-2 py-1" value={startId} onChange={e => setStartId(e.target.value)}>
                <option value="">(none)</option>
                {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
              </select>
            </div>

            <div className="flex gap-2">
              <Button onClick={addQuestion}>Add Question</Button>
              <Button variant="outline" onClick={addOutcome}>Add Outcome</Button>
            </div>

            <div className="space-y-4">
              {nodes.map(n => (
                <div key={n.id} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{n.type.toUpperCase()} • {n.id}</div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => removeNode(n.id)}>Remove</Button>
                    </div>
                  </div>
                  {n.type === 'question' ? (
                    <QuestionEditor
                      node={n as QuestionNode}
                      allNodes={nodes}
                      onChange={(patch) => updateNode<QuestionNode>(n.id, patch)}
                      onAddOption={() => addOption(n as QuestionNode)}
                      onUpdateOption={(optId, patch) => updateOption(n as QuestionNode, optId, patch)}
                      onRemoveOption={(optId) => removeOption(n as QuestionNode, optId)}
                      onSetRoute={(optId, toId) => setOptionRoute(n as QuestionNode, optId, toId)}
                      getRouteForOption={(optId) => getOptionRoute(n as QuestionNode, optId)}
                    />
                  ) : (
                    <OutcomeEditor
                      node={n as OutcomeNode}
                      offers={filteredOffers}
                      onQueryChange={setOfferQuery}
                      onSelectOffer={(o) => setOutcomeOffer(n as OutcomeNode, o)}
                      onClearOffer={() => setOutcomeOffer(n as OutcomeNode, null)}
                      onChange={(patch) => updateNode<OutcomeNode>(n.id, patch)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 flex gap-2">
              <Button onClick={handleSave} disabled={saving}>{editing ? 'Update' : 'Create'}</Button>
              <Button variant="outline" onClick={resetForm}>Reset</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quizzes ({quizzes.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {quizzes.map(q => (
              <div key={q.id} className="flex items-start justify-between border rounded p-3">
                <div>
                  <div className="font-medium">{q.name} <span className="text-xs text-gray-500">({q.status})</span></div>
                  <div className="text-xs text-gray-500">start {q.definition?.start || '-'} • nodes {(q.definition?.nodes || []).length} • priority {q.priority}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => loadForEdit(q)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(q)}>Delete</Button>
                </div>
              </div>
            ))}
            {loading && <div className="text-sm text-gray-500">Loading…</div>}
            {!loading && quizzes.length === 0 && <div className="text-sm text-gray-500">No quizzes yet.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RuleChips({ value, onChange }: { value: Array<{ type: 'substring'|'regex'; pattern: string }>; onChange: (v: Array<{ type: 'substring'|'regex'; pattern: string }>) => void }) {
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<'substring'|'regex'>('substring');
  function add() {
    if (!pattern.trim()) return;
    onChange([{ type, pattern: pattern.trim() }, ...value]);
    setPattern('');
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className="border rounded px-2 py-1" value={type} onChange={e => setType(e.target.value as any)}>
          <option value="substring">substring</option>
          <option value="regex">regex</option>
        </select>
        <Input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="/products/ or ^https?://example.com/…" />
        <Button onClick={add}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-xs border rounded px-2 py-1">
            <span className="font-mono">{r.type}</span>
            <span className="text-gray-600">{r.pattern}</span>
            <button className="text-red-600" onClick={() => remove(i)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function QuestionEditor({ node, allNodes, onChange, onAddOption, onUpdateOption, onRemoveOption, onSetRoute, getRouteForOption } : {
  node: QuestionNode;
  allNodes: QuizNode[];
  onChange: (patch: Partial<QuestionNode>) => void;
  onAddOption: () => void;
  onUpdateOption: (optId: string, patch: Partial<NonNullable<QuestionNode['options']>[number]>) => void;
  onRemoveOption: (optId: string) => void;
  onSetRoute: (optId: string, toId: string) => void;
  getRouteForOption: (optId: string) => string;
}) {
  const opts = node.options || [];
  return (
    <div className="space-y-3">
      <div>
        <Label>Question</Label>
        <Input value={(node.question?.default || '')} onChange={e => onChange({ question: { ...(node.question || {}), default: e.target.value } })} />
      </div>
      <div>
        <Label>Type</Label>
        <select className="border rounded px-2 py-1" value={node.ui.kind} onChange={e => onChange({ ui: { ...node.ui, kind: e.target.value as any } })}>
          <option value="single">single</option>
          <option value="multi">multi</option>
          <option value="range">range</option>
          <option value="input">input</option>
        </select>
      </div>
      {node.ui.kind === 'range' && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="min" value={node.ui.min ?? ''} onChange={e => onChange({ ui: { ...node.ui, min: e.target.value ? Number(e.target.value) : undefined } })} />
          <Input type="number" placeholder="max" value={node.ui.max ?? ''} onChange={e => onChange({ ui: { ...node.ui, max: e.target.value ? Number(e.target.value) : undefined } })} />
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          <Button size="sm" onClick={onAddOption}>Add option</Button>
        </div>
        {opts.map(o => (
          <div key={o.id} className="border rounded p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input value={o.label?.default || ''} onChange={e => onUpdateOption(o.id, { label: { ...(o.label || {}), default: e.target.value } })} placeholder="Option label" />
              <select className="border rounded px-2 py-1" value={getRouteForOption(o.id)} onChange={e => onSetRoute(o.id, e.target.value)}>
                <option value="">Route to… (optional)</option>
                {allNodes.filter(n => n.id !== node.id).map(n => (
                  <option key={n.id} value={n.id}>{n.id}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Effects (comma-separated)</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="must: brand, model" onBlur={e => onUpdateOption(o.id, { effects: { ...(o.effects || {}), must: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} />
                <Input placeholder="should: feature1, feature2" onBlur={e => onUpdateOption(o.id, { effects: { ...(o.effects || {}), should: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} />
                <Input placeholder="exclude: term1, term2" onBlur={e => onUpdateOption(o.id, { effects: { ...(o.effects || {}), exclude: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} />
              </div>
            </div>
            <div className="flex justify-end"><Button variant="destructive" size="sm" onClick={() => onRemoveOption(o.id)}>Remove option</Button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeEditor({ node, offers, onQueryChange, onSelectOffer, onClearOffer, onChange } : {
  node: OutcomeNode;
  offers: AffiliateLink[];
  onQueryChange: (q: string) => void;
  onSelectOffer: (offer: AffiliateLink) => void;
  onClearOffer: () => void;
  onChange: (patch: Partial<OutcomeNode>) => void;
}) {
  const o = node.outcome || {};
  return (
    <div className="space-y-3">
      <div>
        <Label>Message (optional)</Label>
        <Input value={(node.message?.default || '')} onChange={e => onChange({ message: { ...(node.message || {}), default: e.target.value } })} />
      </div>
      <div className="space-y-2">
        <Label>Specific offer (optional)</Label>
        {o.offer ? (
          <div className="border rounded p-2 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{o.offer.title}</div>
              <div className="text-gray-500">{o.offer.url}</div>
            </div>
            <Button size="sm" variant="destructive" onClick={onClearOffer}>Clear</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Search offers" onChange={e => onQueryChange(e.target.value)} />
            <div className="border rounded max-h-40 overflow-auto">
              {offers.slice(0, 20).map(of => (
                <div key={of.id} className="px-2 py-1 hover:bg-gray-50 cursor-pointer" onClick={() => onSelectOffer(of)}>
                  <div className="text-sm font-medium">{of.title}</div>
                  <div className="text-xs text-gray-500">{of.url}</div>
                </div>
              ))}
              {offers.length === 0 && <div className="text-sm text-gray-500 p-2">No offers found</div>}
            </div>
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Additional effects (optional, comma-separated)</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="must: brand, model" onBlur={e => onChange({ outcome: { ...(node.outcome || {}), effects: { ...((node.outcome?.effects) || {}), must: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } } })} />
          <Input placeholder="should: tag1, tag2" onBlur={e => onChange({ outcome: { ...(node.outcome || {}), effects: { ...((node.outcome?.effects) || {}), should: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } } })} />
          <Input placeholder="exclude: term1, term2" onBlur={e => onChange({ outcome: { ...(node.outcome || {}), effects: { ...((node.outcome?.effects) || {}), exclude: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } } })} />
        </div>
      </div>
    </div>
  );
}
