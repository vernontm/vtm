import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Upload, Download, Check, X, Search, Edit3, Image as ImageIcon,
  User, Sparkles, Save, Music, Type, Link2, Loader, ChevronDown, Wand2, Film,
  Play, Clock,
} from 'lucide-react';
import {
  getAvatars, createAvatar, updateAvatar, deleteAvatar,
  getOutfits, createOutfit, updateOutfit, deleteOutfit,
  getLooks, bulkAssignLooks, deleteLook,
  getHeyGenGroups, getHeyGenLooks, importFromHeyGen,
  uploadBlogMedia,
  getRenders, getRender, deleteRender,
} from '../api';
import Modal from '../components/Modal';
import RenderComposer from '../components/RenderComposer';
import RenderPreviewModal from '../components/RenderPreviewModal';

const LOGO_POSITIONS = [
  { key: 'tl', label: 'Top Left' },
  { key: 'tr', label: 'Top Right' },
  { key: 'bl', label: 'Bottom Left' },
  { key: 'br', label: 'Bottom Right' },
];

const DEFAULT_CAPTION_STYLE = {
  font: 'Montserrat', size: 64, color: '#FFFFFF', highlight: '#ff9b26',
  y_position: 0.75, words_per_chunk: 2, stroke: '#000000', stroke_width: 6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — shown when the user has zero avatars
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ onImport, onCreateManual }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40, minHeight: 400,
    }}>
      <div style={{
        maxWidth: 520, textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '36px 32px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={26} color="#fff" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>
          Create your first AI avatar
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
          Import a photo avatar from your HeyGen account (pulls all existing looks),
          or create one manually and upload looks yourself.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onImport} style={btn.primary}>
            <Download size={14} /> Import from HeyGen
          </button>
          <button onClick={onCreateManual} style={btn.secondary}>
            <Plus size={14} /> Start from scratch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HeyGen import modal — pick a group, confirm, import all looks
// ─────────────────────────────────────────────────────────────────────────────
function HeyGenImportModal({ open, onClose, onImported }) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [voiceId, setVoiceId] = useState('iRzy78nlfFK9ezI5GEsc');
  const [stage, setStage] = useState('pick'); // 'pick' | 'confirm' | 'importing' | 'done'
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(''); setStage('pick');
    getHeyGenGroups()
      .then(g => setGroups(g))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleImport() {
    if (!selected) return;
    setStage('importing');
    try {
      const looks = await getHeyGenLooks(selected.id);
      const result = await importFromHeyGen({
        name: name || selected.name || 'Imported Avatar',
        heygen_group_id: selected.id,
        elevenlabs_voice_id: voiceId || null,
        looks: looks.map(l => ({ heygen_look_id: l.id, image_url: l.image_url, name: l.name })),
      });
      setImportedCount(result.looks?.length || 0);
      setStage('done');
      onImported?.(result.avatar);
    } catch (e) {
      setError(e.message);
      setStage('pick');
    }
  }

  if (!open) return null;

  return (
    <Modal onClose={onClose} title="Import avatar from HeyGen">
      <div style={{ minWidth: 520, maxWidth: 680 }}>
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {stage === 'done' && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Check size={24} color="#22c55e" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Imported {importedCount} looks</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
              They're sitting in the Unassigned bucket. Create outfits and drag looks into them.
            </div>
            <button onClick={onClose} style={btn.primary}>Done</button>
          </div>
        )}

        {stage === 'importing' && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Loader size={24} className="spin" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Pulling looks from HeyGen...</div>
          </div>
        )}

        {stage === 'pick' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
              Select a photo avatar group from your HeyGen account. We'll import all looks inside it.
            </div>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <Loader size={20} className="spin" />
              </div>
            ) : groups.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No photo avatar groups found. Create one in HeyGen first.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                {groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelected(g); setName(g.name || ''); }}
                    style={{
                      background: selected?.id === g.id ? 'rgba(255,155,38,0.1)' : 'var(--surface-2)',
                      border: selected?.id === g.id ? '2px solid var(--orange)' : '1px solid var(--border)',
                      borderRadius: 10, padding: 0, overflow: 'hidden',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ aspectRatio: '1 / 1', background: 'var(--surface-3)' }}>
                      {g.thumbnail ? <img src={g.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{g.name || 'Untitled'}</div>
                      {g.num_looks != null && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{g.num_looks} looks</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
                <Field label="Avatar name">
                  <input value={name} onChange={e => setName(e.target.value)} style={input} placeholder="Kara" />
                </Field>
                <Field label="ElevenLabs voice ID (optional)" hint="For TTS narration; can add later">
                  <input value={voiceId} onChange={e => setVoiceId(e.target.value)} style={input} placeholder="iRzy78nlfFK9ezI5GEsc" />
                </Field>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={onClose} style={btn.secondary}>Cancel</button>
                  <button onClick={handleImport} style={btn.primary} disabled={!name.trim()}>
                    <Download size={14} /> Import looks
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template editor — sidebar panel for the selected avatar
// ─────────────────────────────────────────────────────────────────────────────
function TemplateEditor({ avatar, onUpdate }) {
  const [draft, setDraft] = useState(avatar);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(avatar);

  useEffect(() => { setDraft(avatar); }, [avatar?.id]);

  const cap = draft?.caption_style || DEFAULT_CAPTION_STYLE;
  const setCap = (patch) => setDraft(d => ({ ...d, caption_style: { ...cap, ...patch } }));

  async function uploadFile(file, label) {
    setUploading(true);
    try {
      const { url } = await uploadBlogMedia(file);
      return url;
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await updateAvatar(avatar.id, draft);
      onUpdate(updated);
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Avatar name">
        <input value={draft.name || ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={input} />
      </Field>
      <Field label="ElevenLabs voice ID">
        <input value={draft.elevenlabs_voice_id || ''} onChange={e => setDraft(d => ({ ...d, elevenlabs_voice_id: e.target.value }))} style={input} placeholder="iRzy78nlfFK9ezI5GEsc" />
      </Field>

      {/* Logo */}
      <SectionHeader icon={<ImageIcon size={13} />}>Logo</SectionHeader>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{
          width: 54, height: 54, borderRadius: 8, background: 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          {draft.logo_url ? <img src={draft.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageIcon size={20} color="var(--muted)" />}
        </div>
        <label style={{ ...btn.secondary, cursor: 'pointer' }}>
          <Upload size={12} /> {draft.logo_url ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" style={{ display: 'none' }}
            onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const url = await uploadFile(f); setDraft(d => ({ ...d, logo_url: url }));
            }} />
        </label>
        {draft.logo_url && (
          <button onClick={() => setDraft(d => ({ ...d, logo_url: null }))} style={btn.iconDanger}><X size={13} /></button>
        )}
      </div>
      <Field label="Position">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {LOGO_POSITIONS.map(p => (
            <button key={p.key}
              onClick={() => setDraft(d => ({ ...d, logo_position: p.key }))}
              style={{
                ...pill,
                background: draft.logo_position === p.key ? 'var(--orange)' : 'var(--surface-2)',
                color: draft.logo_position === p.key ? '#fff' : 'var(--muted)',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Logo size (${draft.logo_size_pct || 12}% of video width)`}>
        <input type="range" min={5} max={25} step={1} value={draft.logo_size_pct || 12}
          onChange={e => setDraft(d => ({ ...d, logo_size_pct: Number(e.target.value) }))}
          style={{ width: '100%' }} />
      </Field>

      {/* Music */}
      <SectionHeader icon={<Music size={13} />}>Music</SectionHeader>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {draft.default_music_url ? (
          <audio controls src={draft.default_music_url} style={{ flex: 1, height: 32 }} />
        ) : (
          <div style={{ flex: 1, fontSize: 11, color: 'var(--muted)' }}>No music set</div>
        )}
        <label style={{ ...btn.secondary, cursor: 'pointer' }}>
          <Upload size={12} /> {draft.default_music_url ? 'Replace' : 'Upload'}
          <input type="file" accept="audio/*" style={{ display: 'none' }}
            onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const url = await uploadFile(f); setDraft(d => ({ ...d, default_music_url: url }));
            }} />
        </label>
        {draft.default_music_url && (
          <button onClick={() => setDraft(d => ({ ...d, default_music_url: null }))} style={btn.iconDanger}><X size={13} /></button>
        )}
      </div>
      <Field label={`Volume (${Math.round((draft.default_volume ?? 0.15) * 100)}%)`}>
        <input type="range" min={0} max={1} step={0.05} value={draft.default_volume ?? 0.15}
          onChange={e => setDraft(d => ({ ...d, default_volume: Number(e.target.value) }))}
          style={{ width: '100%' }} />
      </Field>
      <Field label={`Auto fade-out (${draft.default_fade_secs ?? 1.5}s)`}>
        <input type="range" min={0} max={5} step={0.1} value={draft.default_fade_secs ?? 1.5}
          onChange={e => setDraft(d => ({ ...d, default_fade_secs: Number(e.target.value) }))}
          style={{ width: '100%' }} />
      </Field>

      {/* Captions */}
      <SectionHeader icon={<Type size={13} />}>Captions</SectionHeader>
      <Field label="Words per chunk">
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => setCap({ words_per_chunk: n })}
              style={{
                ...pill, flex: 1,
                background: cap.words_per_chunk === n ? 'var(--orange)' : 'var(--surface-2)',
                color: cap.words_per_chunk === n ? '#fff' : 'var(--muted)',
              }}>{n}</button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Text color">
          <input type="color" value={cap.color} onChange={e => setCap({ color: e.target.value })} style={{ ...input, height: 34, padding: 2 }} />
        </Field>
        <Field label="Highlight">
          <input type="color" value={cap.highlight} onChange={e => setCap({ highlight: e.target.value })} style={{ ...input, height: 34, padding: 2 }} />
        </Field>
      </div>
      <Field label={`Font size (${cap.size}px)`}>
        <input type="range" min={32} max={120} step={2} value={cap.size} onChange={e => setCap({ size: Number(e.target.value) })} style={{ width: '100%' }} />
      </Field>
      <Field label={`Y position (${Math.round((cap.y_position || 0.75) * 100)}% from top)`}>
        <input type="range" min={0.1} max={0.95} step={0.01} value={cap.y_position || 0.75} onChange={e => setCap({ y_position: Number(e.target.value) })} style={{ width: '100%' }} />
      </Field>

      <button onClick={save} disabled={!dirty || saving || uploading}
        style={{ ...btn.primary, marginTop: 8, justifyContent: 'center', opacity: (!dirty || saving) ? 0.5 : 1 }}>
        {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
        {saving ? 'Saving...' : uploading ? 'Uploading...' : dirty ? 'Save template' : 'Saved'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Outfit panel — tabs + look grid + bulk actions
// ─────────────────────────────────────────────────────────────────────────────
function OutfitPanel({ avatar, onReimport }) {
  const [outfits, setOutfits] = useState([]);
  const [looks, setLooks] = useState([]);
  const [activeOutfit, setActiveOutfit] = useState('all'); // 'all' | 'unassigned' | outfit_id
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [newOutfitName, setNewOutfitName] = useState('');

  const reloadOutfits = useCallback(() => {
    getOutfits(avatar.id).then(setOutfits);
  }, [avatar.id]);

  const reloadLooks = useCallback(() => {
    getLooks(avatar.id).then(setLooks);
  }, [avatar.id]);

  useEffect(() => { reloadOutfits(); reloadLooks(); }, [reloadOutfits, reloadLooks]);

  const visibleLooks = useMemo(() => {
    if (activeOutfit === 'all') return looks;
    if (activeOutfit === 'unassigned') return looks.filter(l => !l.outfit_id);
    return looks.filter(l => l.outfit_id === activeOutfit);
  }, [looks, activeOutfit]);

  const toggleLook = (id) => {
    setSelectedIds(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  async function handleCreateOutfit() {
    if (!newOutfitName.trim()) return;
    await createOutfit({ avatar_id: avatar.id, name: newOutfitName.trim() });
    setNewOutfitName(''); setCreating(false);
    reloadOutfits();
  }

  async function handleAssign(outfitId) {
    if (!selectedIds.size) return;
    await bulkAssignLooks(Array.from(selectedIds), outfitId);
    setSelectedIds(new Set());
    reloadLooks();
  }

  async function handleDeleteOutfit(outfit) {
    if (!confirm(`Delete outfit "${outfit.name}"? Looks inside will move to Unassigned.`)) return;
    await deleteOutfit(outfit.id);
    if (activeOutfit === outfit.id) setActiveOutfit('all');
    reloadOutfits(); reloadLooks();
  }

  const countFor = (key) => {
    if (key === 'all') return looks.length;
    if (key === 'unassigned') return looks.filter(l => !l.outfit_id).length;
    return looks.filter(l => l.outfit_id === key).length;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
      {/* Outfit tabs */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 14px',
        borderBottom: '1px solid var(--border)', alignItems: 'center',
      }}>
        <OutfitTab active={activeOutfit === 'all'} onClick={() => setActiveOutfit('all')} label="All Looks" count={countFor('all')} />
        <OutfitTab active={activeOutfit === 'unassigned'} onClick={() => setActiveOutfit('unassigned')} label="Unassigned" count={countFor('unassigned')} danger />
        {outfits.map(o => (
          <OutfitTab key={o.id}
            active={activeOutfit === o.id}
            onClick={() => setActiveOutfit(o.id)}
            onDelete={() => handleDeleteOutfit(o)}
            label={o.name} count={countFor(o.id)} />
        ))}
        {creating ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={newOutfitName} onChange={e => setNewOutfitName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateOutfit()}
              placeholder="Outfit name" style={{ ...input, width: 140, padding: '6px 10px', fontSize: 12 }} />
            <button onClick={handleCreateOutfit} style={btn.iconPrimary}><Check size={13} /></button>
            <button onClick={() => { setCreating(false); setNewOutfitName(''); }} style={btn.iconDanger}><X size={13} /></button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ ...pill, background: 'transparent', border: '1px dashed var(--border)', color: 'var(--muted)' }}>
            <Plus size={11} /> New outfit
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onReimport} style={btn.secondary}>
          <Download size={12} /> Import from HeyGen
        </button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 10, alignItems: 'center', fontSize: 12,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selectedIds.size} selected</span>
          <span style={{ color: 'var(--muted)' }}>Assign to:</span>
          <button onClick={() => handleAssign(null)} style={{ ...pill, background: 'var(--surface-3)' }}>Unassigned</button>
          {outfits.map(o => (
            <button key={o.id} onClick={() => handleAssign(o.id)}
              style={{ ...pill, background: 'var(--orange)', color: '#fff' }}>{o.name}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setSelectedIds(new Set())} style={btn.secondary}>Clear</button>
        </div>
      )}

      {/* Look grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {visibleLooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
            {looks.length === 0 ? 'No looks yet. Import from HeyGen to get started.' : 'Nothing in this bucket.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {visibleLooks.map(look => (
              <LookCard key={look.id} look={look} selected={selectedIds.has(look.id)} onToggle={() => toggleLook(look.id)}
                outfit={outfits.find(o => o.id === look.outfit_id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OutfitTab({ active, onClick, onDelete, label, count, danger }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={onClick} style={{
        ...pill,
        background: active ? 'var(--orange)' : 'var(--surface-2)',
        color: active ? '#fff' : (danger && count > 0 ? '#f59e0b' : 'var(--muted)'),
        paddingRight: onDelete ? 26 : 12,
      }}>
        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{count}</span>
      </button>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: active ? '#fff' : 'var(--muted)', padding: 2, borderRadius: 4,
          }}><X size={11} /></button>
      )}
    </div>
  );
}

function LookCard({ look, selected, onToggle, outfit }) {
  return (
    <div onClick={onToggle} style={{
      position: 'relative', aspectRatio: '9 / 16', borderRadius: 10, overflow: 'hidden',
      cursor: 'pointer', background: 'var(--surface-3)',
      border: selected ? '2px solid var(--orange)' : '1px solid var(--border)',
      transition: 'border 0.12s',
    }}>
      <img src={look.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {selected && (
        <div style={{
          position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
          background: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={13} color="#fff" />
        </div>
      )}
      {outfit && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
          padding: '14px 8px 6px', fontSize: 10, fontWeight: 600, color: '#fff',
        }}>{outfit.name}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const RENDER_PILL = {
  draft:              { bg: 'rgba(142,142,160,0.15)', text: '#8e8ea0', label: 'Draft' },
  pending:            { bg: 'rgba(2,132,199,0.15)', text: '#38bdf8',  label: 'Queued' },
  generating_audio:   { bg: 'rgba(161,98,7,0.15)',  text: '#fbbf24',  label: 'Audio…' },
  generating_clips:   { bg: 'rgba(202,138,4,0.15)', text: '#facc15',  label: 'HeyGen…' },
  stitching:          { bg: 'rgba(124,58,237,0.15)', text: '#a78bfa', label: 'Stitching…' },
  done:               { bg: 'rgba(21,128,61,0.15)', text: '#4ade80',  label: 'Ready' },
  failed:             { bg: 'rgba(220,38,38,0.15)', text: '#f87171',  label: 'Failed' },
};

function RenderStrip({ avatar, refreshKey, onOpen }) {
  const [renders, setRenders] = useState([]);
  const timerRef = useRef(null);

  const reload = useCallback(() => {
    getRenders(avatar.id).then(setRenders).catch(() => {});
  }, [avatar.id]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  // Poll while any render is in-flight
  useEffect(() => {
    const anyInFlight = renders.some(r => ['pending', 'generating_audio', 'generating_clips', 'stitching'].includes(r.status));
    if (!anyInFlight) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(reload, 7000);
    return () => clearInterval(timerRef.current);
  }, [renders, reload]);

  if (!renders.length) return null;

  return (
    <div style={{
      borderTop: '1px solid var(--border)', padding: '10px 14px',
      background: 'var(--surface)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Film size={13} color="var(--muted)" />
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
          Renders ({renders.length})
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {renders.map(r => {
          const pill = RENDER_PILL[r.status] || RENDER_PILL.draft;
          return (
            <button key={r.id} onClick={() => onOpen(r)}
              style={{
                flexShrink: 0, width: 180, textAlign: 'left',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{
                  background: pill.bg, color: pill.text,
                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                }}>{pill.label}</span>
                {r.status === 'done' && <Play size={11} color="var(--muted)" />}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.title || r.script?.slice(0, 30) + '…'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={9} /> {new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Avatars() {
  const [avatars, setAvatars] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [previewRenderId, setPreviewRenderId] = useState(null);
  const [previewRender, setPreviewRender] = useState(null);
  const [renderRefreshKey, setRenderRefreshKey] = useState(0);

  const selected = avatars.find(a => a.id === selectedId);

  // Load + poll the focused render for live status during preview
  useEffect(() => {
    if (!previewRenderId) { setPreviewRender(null); return; }
    let cancelled = false;
    async function loop() {
      try {
        const r = await getRender(previewRenderId);
        if (cancelled) return;
        setPreviewRender(r);
        if (r && ['pending', 'generating_audio', 'generating_clips', 'stitching'].includes(r.status)) {
          setTimeout(loop, 5000);
        }
      } catch {}
    }
    loop();
    return () => { cancelled = true; };
  }, [previewRenderId]);

  async function handleDeleteRender() {
    if (!previewRender) return;
    if (!confirm('Delete this render? The final MP4 stays in storage.')) return;
    await deleteRender(previewRender.id);
    setPreviewRenderId(null);
    setRenderRefreshKey(k => k + 1);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAvatars();
      setAvatars(data);
      if (!selectedId && data.length) setSelectedId(data[0].id);
      if (selectedId && !data.find(a => a.id === selectedId)) setSelectedId(data[0]?.id || '');
    } finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { reload(); }, []); // eslint-disable-line

  async function handleCreateManual() {
    const name = prompt('Avatar name?');
    if (!name) return;
    const created = await createAvatar({ name, elevenlabs_voice_id: 'iRzy78nlfFK9ezI5GEsc' });
    await reload();
    setSelectedId(created.id);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete avatar "${selected.name}"? This removes all outfits and looks (HeyGen is not affected).`)) return;
    await deleteAvatar(selected.id);
    setSelectedId('');
    await reload();
  }

  if (loading && !avatars.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Loader size={20} className="spin" /></div>;
  }

  if (!avatars.length) {
    return (
      <>
        <EmptyState onImport={() => setImportOpen(true)} onCreateManual={handleCreateManual} />
        <HeyGenImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={a => { setSelectedId(a.id); reload(); }} />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <User size={18} />
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Avatars</div>
        <div style={{ flex: 1 }} />
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          style={{ ...input, width: 180 }}>
          {avatars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={handleCreateManual} style={btn.secondary}><Plus size={13} /> New</button>
        <button onClick={() => setImportOpen(true)} style={btn.secondary}><Download size={13} /> Import</button>
        {selected && <button onClick={() => setComposerOpen(true)} style={btn.primary}><Wand2 size={13} /> New render</button>}
        {selected && <button onClick={handleDelete} style={btn.iconDanger} title="Delete avatar"><Trash2 size={14} /></button>}
      </div>

      {/* Main split */}
      {selected && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: template editor */}
          <aside style={{
            width: 320, minWidth: 320, borderRight: '1px solid var(--border)',
            padding: 16, overflow: 'auto',
          }}>
            <TemplateEditor avatar={selected} onUpdate={u => setAvatars(as => as.map(a => a.id === u.id ? u : a))} />
          </aside>

          {/* Right: outfits + looks + renders strip */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
            <OutfitPanel avatar={selected} onReimport={() => setImportOpen(true)} />
            <RenderStrip avatar={selected} refreshKey={renderRefreshKey} onOpen={r => setPreviewRenderId(r.id)} />
          </div>
        </div>
      )}

      <HeyGenImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={a => { setSelectedId(a.id); reload(); }} />

      {composerOpen && selected && (
        <RenderComposer
          avatar={selected}
          onClose={() => setComposerOpen(false)}
          onCreated={r => { setRenderRefreshKey(k => k + 1); setPreviewRenderId(r.id); }}
        />
      )}

      {previewRender && (
        <RenderPreviewModal
          render={previewRender}
          avatar={selected}
          onClose={() => setPreviewRenderId(null)}
          onScheduled={() => setRenderRefreshKey(k => k + 1)}
          onDelete={handleDeleteRender}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI bits
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, opacity: 0.7 }}>{hint}</div>}
    </div>
  );
}

function SectionHeader({ icon, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text)', paddingTop: 6, marginTop: 2,
      borderTop: '1px solid var(--border)',
    }}>
      {icon} {children}
    </div>
  );
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'var(--font-display)', outline: 'none',
};

const pill = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
  cursor: 'pointer', border: 'none', transition: 'all 0.12s',
  fontFamily: 'var(--font-display)',
};

const btn = {
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
    color: '#fff', fontSize: 12, fontWeight: 700,
    fontFamily: 'var(--font-display)',
  },
  secondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12, fontWeight: 600,
    fontFamily: 'var(--font-display)',
  },
  iconDanger: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
    background: 'transparent', border: '1px solid var(--border)', color: '#f87171',
  },
  iconPrimary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
    background: 'var(--orange)', border: 'none', color: '#fff',
  },
};
