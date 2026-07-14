import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, ChevronLeft, ChevronUp, ChevronDown,
  Link as LinkIcon, Image as ImageIcon, Film, FileText, ExternalLink, Save, X, ListChecks,
} from 'lucide-react';
import {
  getWalkthroughs, getWalkthrough, createWalkthrough, updateWalkthrough, deleteWalkthrough, uploadFile,
} from '../api';
import { toast } from '../components/Toast';

const BLANK_STEP = () => ({ title: '', body: '', links: [], media: [] });
const BLANK_WT = () => ({ title: '', description: '', category: 'SOPs', steps: [BLANK_STEP()] });

const mediaTypeOf = (file) => {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.includes('pdf')) return 'pdf';
  return 'doc';
};
const MEDIA_ICON = { image: ImageIcon, video: Film, pdf: FileText, doc: FileText };

// Turn bare URLs inside a block of text into clickable links (new tab).
function Linkify({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: 'var(--link)', fontWeight: 600, wordBreak: 'break-word' }}>{p}</a>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

/* ── Viewer ──────────────────────────────────────────────────────────────── */
function Viewer({ wt, onBack, onEdit, isAdmin }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 14 }}><ChevronLeft size={15} /> All walkthroughs</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{wt.title}</div>
          {wt.description && <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{wt.description}</div>}
        </div>
        {isAdmin && <button className="btn-ghost" onClick={onEdit}><Pencil size={14} /> Edit</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {(wt.steps || []).map((s, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{s.title || `Step ${i + 1}`}</div>
            </div>
            {s.body && <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}><Linkify text={s.body} /></div>}

            {(s.links || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {s.links.map((l, li) => (
                  <a key={li} href={l.url?.startsWith('http') ? l.url : `https://${l.url}`} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.30)', color: 'var(--orange)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                    <LinkIcon size={13} /> {l.label?.trim() || l.url} <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            )}

            {(s.media || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                {s.media.map((m, mi) => {
                  if (m.type === 'image') return (
                    <a key={mi} href={m.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                      <img src={m.url} alt={m.name || ''} style={{ maxWidth: '100%', maxHeight: 340, borderRadius: 10, border: '1px solid var(--border)' }} />
                    </a>
                  );
                  if (m.type === 'video') return (
                    <video key={mi} src={m.url} controls style={{ maxWidth: '100%', maxHeight: 380, borderRadius: 10, border: '1px solid var(--border)' }} />
                  );
                  const Icon = MEDIA_ICON[m.type] || FileText;
                  return (
                    <a key={mi} href={m.url} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                      <Icon size={16} style={{ color: 'var(--orange)' }} /> {m.name || 'Open document'} <ExternalLink size={12} style={{ color: 'var(--muted)' }} />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {(wt.steps || []).length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>This walkthrough has no steps yet.</div>}
      </div>
    </div>
  );
}

/* ── Media uploader (one step) ───────────────────────────────────────────── */
function MediaAdder({ onAdd }) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const { url } = await uploadFile(f);
        onAdd({ type: mediaTypeOf(f), url, name: f.name });
      }
    } catch (err) { toast('error', err.message || 'Upload failed'); }
    finally { setBusy(false); }
  };
  return (
    <label className="btn-ghost" style={{ cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
      <ImageIcon size={13} /> {busy ? 'Uploading…' : 'Add image / video / file'}
      <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" multiple hidden disabled={busy} onChange={onPick} />
    </label>
  );
}

/* ── Builder ─────────────────────────────────────────────────────────────── */
function Builder({ initial, onCancel, onSaved }) {
  const [title, setTitle] = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [steps, setSteps] = useState(initial.steps?.length ? initial.steps : [BLANK_STEP()]);
  const [saving, setSaving] = useState(false);

  const updateStep = (i, patch) => setSteps(s => s.map((st, idx) => idx === i ? { ...st, ...patch } : st));
  const addStep = () => setSteps(s => [...s, BLANK_STEP()]);
  const removeStep = (i) => setSteps(s => s.filter((_, idx) => idx !== i));
  const moveStep = (i, dir) => setSteps(s => {
    const j = i + dir; if (j < 0 || j >= s.length) return s;
    const copy = [...s]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
  });

  const save = async () => {
    if (!title.trim()) { toast('error', 'Give the walkthrough a title'); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description, category: 'SOPs', steps };
      if (initial.id) await updateWalkthrough(initial.id, payload);
      else await createWalkthrough(payload);
      toast('success', 'Walkthrough saved');
      onSaved();
    } catch (e) { toast('error', e.message); setSaving(false); }
  };

  const field = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ maxWidth: 780 }}>
      <button className="btn-ghost" onClick={onCancel} style={{ marginBottom: 14 }}><ChevronLeft size={15} /> Cancel</button>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={lbl}>Title</label><input value={title} onChange={e => setTitle(e.target.value)} style={field} placeholder="e.g. How to onboard a new client" autoFocus /></div>
        <div><label style={lbl}>Intro (optional)</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...field, resize: 'vertical' }} placeholder="What this walkthrough covers…" /></div>
      </div>

      {steps.map((s, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: 999, background: 'var(--orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{i + 1}</div>
            <input value={s.title} onChange={e => updateStep(i, { title: e.target.value })} style={{ ...field, fontWeight: 700 }} placeholder={`Step ${i + 1} title (optional)`} />
            <div style={{ display: 'flex', gap: 2 }}>
              <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={14} /></button>
              <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Move down"><ChevronDown size={14} /></button>
              <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => removeStep(i)} disabled={steps.length === 1} title="Remove step"><Trash2 size={14} /></button>
            </div>
          </div>

          <textarea value={s.body} onChange={e => updateStep(i, { body: e.target.value })} rows={4} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} placeholder="Describe this step. Paste any URLs here and they become clickable links automatically." />

          {/* Links */}
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Links</label>
            {(s.links || []).map((l, li) => (
              <div key={li} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input value={l.label} onChange={e => updateStep(i, { links: s.links.map((x, xi) => xi === li ? { ...x, label: e.target.value } : x) })} style={{ ...field, flex: '0 0 32%' }} placeholder="Label (optional)" />
                <input value={l.url} onChange={e => updateStep(i, { links: s.links.map((x, xi) => xi === li ? { ...x, url: e.target.value } : x) })} style={{ ...field, flex: 1 }} placeholder="https://…" />
                <button className="btn-ghost" style={{ padding: '5px 8px', color: '#ff5c5c' }} onClick={() => updateStep(i, { links: s.links.filter((_, xi) => xi !== li) })}><X size={13} /></button>
              </div>
            ))}
            <button className="btn-ghost" style={{ marginTop: 2 }} onClick={() => updateStep(i, { links: [...(s.links || []), { label: '', url: '' }] })}><LinkIcon size={13} /> Add link</button>
          </div>

          {/* Media */}
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Images, video & files</label>
            {(s.media || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {s.media.map((m, mi) => {
                  const Icon = MEDIA_ICON[m.type] || FileText;
                  return (
                    <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 260 }}>
                      {m.type === 'image'
                        ? <img src={m.url} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: 'cover' }} />
                        : <Icon size={15} style={{ color: 'var(--orange)' }} />}
                      <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || m.type}</span>
                      <button className="btn-ghost" style={{ padding: '2px 4px', color: '#ff5c5c' }} onClick={() => updateStep(i, { media: s.media.filter((_, xi) => xi !== mi) })}><X size={12} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <MediaAdder onAdd={(m) => updateStep(i, { media: [...(s.media || []), m] })} />
          </div>
        </div>
      ))}

      <button className="btn-ghost" onClick={addStep} style={{ marginBottom: 18 }}><Plus size={14} /> Add step</button>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save walkthrough'}</button>
      </div>
    </div>
  );
}

/* ── Root ────────────────────────────────────────────────────────────────── */
export default function Walkthroughs({ isAdmin, onExit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState({ type: 'list' }); // list | view | edit
  const [current, setCurrent] = useState(null);

  const loadList = useCallback(async () => {
    try { setItems(await getWalkthroughs()); } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const openView = async (id) => {
    try { const wt = await getWalkthrough(id); setCurrent(wt); setMode({ type: 'view' }); }
    catch (e) { toast('error', e.message); }
  };
  const openEdit = async (id) => {
    if (!id) { setCurrent(BLANK_WT()); setMode({ type: 'edit' }); return; }
    try { const wt = await getWalkthrough(id); setCurrent(wt); setMode({ type: 'edit' }); }
    catch (e) { toast('error', e.message); }
  };
  const remove = async (wt) => {
    if (!window.confirm(`Delete "${wt.title}"?`)) return;
    setItems(x => x.filter(w => w.id !== wt.id));
    try { await deleteWalkthrough(wt.id); } catch (e) { toast('error', e.message); loadList(); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  if (mode.type === 'view' && current) {
    return <Viewer wt={current} isAdmin={isAdmin} onBack={() => { setMode({ type: 'list' }); loadList(); }} onEdit={() => openEdit(current.id)} />;
  }
  if (mode.type === 'edit' && current) {
    return <Builder initial={current} onCancel={() => setMode({ type: 'list' })} onSaved={() => { setMode({ type: 'list' }); loadList(); }} />;
  }

  // list
  return (
    <div>
      {onExit && <button className="btn-ghost" onClick={onExit} style={{ marginBottom: 14 }}><ChevronLeft size={15} /> All resources</button>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Walkthroughs</div>
        {isAdmin && <button className="btn-primary" onClick={() => openEdit(null)}><Plus size={15} /> New Walkthrough</button>}
      </div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <ListChecks size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div>No walkthroughs yet.{isAdmin ? ' Click “New Walkthrough” to build a step-by-step guide.' : ''}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {items.map(w => (
            <div key={w.id} onClick={() => openView(w.id)}
              style={{ cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-sm)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ListChecks size={17} style={{ color: 'var(--orange)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{w.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{w.step_count} step{w.step_count !== 1 ? 's' : ''}</div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openEdit(w.id)} title="Edit"><Pencil size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(w)} title="Delete"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {w.description && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
