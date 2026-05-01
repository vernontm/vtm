import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader, Wand2, Shuffle, Play, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import {
  getOutfits, getLooks,
  createRender, suggestTitle,
} from '../api';

// Split a script into sentences. Keeps trailing punctuation, trims, drops
// empties. Avoids the lookbehind regex `(?<=[.!?])\s+` because older Safari
// (< 16.4) and older iOS WebKit reject lookbehind with "Invalid regular
// expression: invalid group specifier name", which crashes the whole page.
function splitSentences(text) {
  if (!text) return [];
  const src = text.replace(/\r/g, '');
  const out = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      // Look ahead for whitespace (or end-of-string) to confirm sentence break.
      const next = src[i + 1];
      if (next === undefined || /\s/.test(next)) {
        const trimmed = buf.trim();
        if (trimmed) out.push(trimmed);
        buf = '';
      }
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

// Rough cost estimates — pessimistic pay-as-you-go rates. Override in code if
// your HeyGen/ElevenLabs plan is cheaper.
const COST_PER_1K_CHARS_ELEVENLABS = 0.30;   // $0.30 per 1k chars (turbo v2.5 PAYG)
const COST_PER_HEYGEN_VIDEO        = 0.30;   // rough average for short photo-avatar clips
const COST_CLAUDE_TITLE            = 0.01;   // tiny — Sonnet 4.5 on ~200 tokens

function estimateCost(script, sentences) {
  const chars = (script || '').length;
  const clips = sentences.length;
  const elevenlabs = (chars / 1000) * COST_PER_1K_CHARS_ELEVENLABS;
  const heygen     = clips * COST_PER_HEYGEN_VIDEO;
  return {
    elevenlabs, heygen, claude: COST_CLAUDE_TITLE,
    total: elevenlabs + heygen + COST_CLAUDE_TITLE,
    chars, clips,
  };
}

export default function RenderComposer({ avatar, onClose, onCreated }) {
  const [outfits, setOutfits] = useState([]);
  const [looksByOutfit, setLooksByOutfit] = useState({}); // { outfit_id: Look[] }
  const [outfitId, setOutfitId] = useState('');
  const [title, setTitle] = useState('');
  const [titleLoading, setTitleLoading] = useState(false);
  const [script, setScript] = useState('');
  const [assignments, setAssignments] = useState([]); // parallel to sentences: [{ text, look_id }]
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load outfits on open and filter to ones with looks
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ofs = await getOutfits(avatar.id);
      const allLooks = await getLooks(avatar.id);
      const grouped = {};
      for (const l of allLooks) {
        if (!l.outfit_id) continue;
        (grouped[l.outfit_id] ||= []).push(l);
      }
      if (cancelled) return;
      const nonEmpty = ofs.filter(o => (grouped[o.id] || []).length > 0);
      setOutfits(nonEmpty);
      setLooksByOutfit(grouped);
      if (nonEmpty.length && !outfitId) setOutfitId(nonEmpty[0].id);
    }
    load().catch(e => setError(e.message));
    return () => { cancelled = true; };
  }, [avatar.id]); // eslint-disable-line

  const sentences = useMemo(() => splitSentences(script), [script]);
  const cost      = useMemo(() => estimateCost(script, sentences), [script, sentences]);
  const looks = looksByOutfit[outfitId] || [];

  // Auto-assign round-robin whenever sentences or outfit changes
  useEffect(() => {
    if (!sentences.length || !looks.length) { setAssignments([]); return; }
    setAssignments(sentences.map((text, i) => ({
      text,
      look_id: looks[i % looks.length].id,
    })));
  }, [script, outfitId, looks.length]); // eslint-disable-line

  function cycleAssignment(idx, dir = 1) {
    setAssignments(prev => {
      const next = [...prev];
      const curLookId = next[idx].look_id;
      const curPos = looks.findIndex(l => l.id === curLookId);
      const newPos = (curPos + dir + looks.length) % looks.length;
      next[idx] = { ...next[idx], look_id: looks[newPos].id };
      return next;
    });
  }

  function shuffle() {
    if (!looks.length) return;
    // Shift starting index so round-robin picks a different seed
    setAssignments(prev => prev.map((a, i) => ({
      ...a,
      look_id: looks[(i + Math.floor(Math.random() * looks.length)) % looks.length].id,
    })));
  }

  async function handleAutoTitle() {
    if (!script.trim()) return setError('Paste a script first');
    setTitleLoading(true); setError('');
    try {
      const r = await suggestTitle(script);
      if (r?.title) setTitle(r.title);
    } catch (e) { setError(e.message); }
    finally { setTitleLoading(false); }
  }

  async function handleGenerate() {
    setError('');
    if (!outfitId) return setError('Pick an outfit first');
    if (!script.trim()) return setError('Paste a script');
    if (!assignments.length) return setError('Script produced no sentences');
    setSubmitting(true);
    try {
      const render = await createRender({
        avatar_id: avatar.id,
        outfit_id: outfitId,
        title: title.trim() || null,
        script: script.trim(),
        sentences: assignments.map(a => ({ text: a.text, look_id: a.look_id })),
        status: 'pending',
      });
      onCreated?.(render);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const totalLooks = looks.length;
  const canGenerate = !!outfitId && !!script.trim() && assignments.length > 0 && !submitting;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 900, width: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>New render · {avatar.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Picks an angle per sentence. Click a thumbnail to cycle to a different angle.
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="btn-ghost" style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {outfits.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            You need at least one outfit with looks assigned. Create an outfit on the Avatars page and bucket some looks into it first.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Left: setup */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Outfit</Label>
                <select value={outfitId} onChange={e => setOutfitId(e.target.value)} style={input}>
                  {outfits.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({(looksByOutfit[o.id] || []).length} angles)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Title overlay (optional)</Label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    style={{ ...input, flex: 1 }} placeholder="e.g. effort. environment. presentation." />
                  <button type="button" onClick={handleAutoTitle} disabled={!script.trim() || titleLoading}
                    style={{ ...pillBtn, opacity: (!script.trim() || titleLoading) ? 0.5 : 1, padding: '6px 10px' }}
                    title="Auto-generate title from script via Claude">
                    {titleLoading ? <Loader size={11} className="spin" /> : <Sparkles size={11} />} Auto
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, opacity: 0.7 }}>
                  Burned onto the video using your avatar's title style (font + colors set in the template).
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Label>Script</Label>
                <textarea value={script} onChange={e => setScript(e.target.value)}
                  placeholder="Paste your full script here. Sentences are split on . ! ? — each sentence becomes one lip-synced clip."
                  style={{ ...input, flex: 1, minHeight: 260, resize: 'vertical', fontFamily: 'var(--font-body, inherit)', lineHeight: 1.5 }} />
              </div>
            </div>

            {/* Right: sentence mapping */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Label>Sentences → angles ({assignments.length})</Label>
                <button onClick={shuffle} disabled={!assignments.length} style={pillBtn}>
                  <Shuffle size={11} /> Reshuffle
                </button>
              </div>
              <div style={{
                flex: 1, overflowY: 'auto', minHeight: 300,
                border: '1px solid var(--border)', borderRadius: 10,
                background: 'var(--surface-2)', padding: 8,
              }}>
                {assignments.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                    Paste a script to see the sentence-by-sentence angle map.
                  </div>
                ) : (
                  assignments.map((a, i) => {
                    const look = looks.find(l => l.id === a.look_id);
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: 8, marginBottom: 6,
                        borderRadius: 8, background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          {look ? (
                            <img src={look.image_url} alt="" style={{
                              width: 50, height: 88, borderRadius: 6, objectFit: 'cover',
                              border: '1px solid var(--border)',
                            }} />
                          ) : (
                            <div style={{ width: 50, height: 88, borderRadius: 6, background: 'var(--surface-3)' }} />
                          )}
                          <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'center' }}>
                            <button onClick={() => cycleAssignment(i, -1)} style={tinyIcon}><ChevronLeft size={10} /></button>
                            <button onClick={() => cycleAssignment(i, +1)} style={tinyIcon}><ChevronRight size={10} /></button>
                          </div>
                        </div>
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--text)', lineHeight: 1.45 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
                            #{i + 1} · angle {(looks.findIndex(l => l.id === a.look_id) + 1) || '?'} / {totalLooks}
                          </div>
                          {a.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {sentences.length > 0 && (
          <div style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Est. cost</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>${cost.total.toFixed(2)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 180, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
              <div>ElevenLabs TTS: <strong style={{ color: 'var(--text)' }}>${cost.elevenlabs.toFixed(2)}</strong> ({cost.chars} chars)</div>
              <div>HeyGen clips: <strong style={{ color: 'var(--text)' }}>${cost.heygen.toFixed(2)}</strong> ({cost.clips} videos)</div>
              <div>Claude title: <strong style={{ color: 'var(--text)' }}>~${cost.claude.toFixed(2)}</strong></div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', opacity: 0.7, maxWidth: 200 }}>
              Rough estimate — actual cost depends on your HeyGen / ElevenLabs plan.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {assignments.length > 0 && `${assignments.length} clips · HeyGen generation starts when your local server picks it up.`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={submitting} className="btn-ghost">Cancel</button>
            <button onClick={handleGenerate} disabled={!canGenerate}
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: canGenerate ? 1 : 0.5 }}>
              {submitting ? <Loader size={13} className="spin" /> : <Wand2 size={13} />}
              {submitting ? 'Queueing...' : 'Generate render'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 5 }}>{children}</div>;
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13,
  fontFamily: 'var(--font-display)', outline: 'none',
};

const pillBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--muted)', fontSize: 10, fontWeight: 700,
  padding: '4px 10px', borderRadius: 14, cursor: 'pointer',
};

const tinyIcon = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, padding: 0, borderRadius: 5, cursor: 'pointer',
  background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--muted)',
};
