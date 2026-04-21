import React, { useState } from 'react';
import { X, Save, Loader, RotateCcw } from 'lucide-react';
import { updateRender } from '../api';

// Edit a render's overlay settings (title, colors, caption style, music volume)
// then bounce status back to `pending` so the worker re-stitches from cached
// clips. Zero new ElevenLabs / HeyGen charges.

const FONTS = [
  { key: 'montserrat',  label: 'Montserrat ExtraBold' },
  { key: 'poppins',     label: 'Poppins ExtraBold' },
  { key: 'impact',      label: 'Impact' },
  { key: 'arial_black', label: 'Arial Black' },
];

export default function RenderEditModal({ render, avatar, onClose, onSaved }) {
  const [title, setTitle] = useState(render.title || '');
  // Title style: use render override, else avatar default, else fallback
  const [titleS, setTitleS] = useState({
    enabled: true, font: 'montserrat', color: '#FFFFFF', bg_color: '#E91E63',
    size: 72, y_position: 0.12, padding: 28, uppercase: false,
    ...(avatar?.title_style || {}),
    ...(render?.title_style || {}),
  });
  const [capS, setCapS] = useState({
    font: 'montserrat', size: 64, color: '#FFFFFF', highlight: '#ff9b26',
    y_position: 0.75, words_per_chunk: 2, stroke: '#000000', stroke_width: 6,
    ...(avatar?.caption_style || {}),
    ...(render?.caption_style || {}),
  });
  const [musicVol, setMusicVol]   = useState(render.music_volume ?? avatar?.default_volume ?? 0.15);
  const [musicFade, setMusicFade] = useState(render.music_fade_secs ?? avatar?.default_fade_secs ?? 1.5);
  const [logoPos, setLogoPos]     = useState(render.logo_position || avatar?.logo_position || 'tr');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function handleSaveAndRerender() {
    setSaving(true); setError('');
    try {
      await updateRender(render.id, {
        title,
        title_style: titleS,
        caption_style: capS,
        music_volume: musicVol,
        music_fade_secs: musicFade,
        logo_position: logoPos,
        status: 'pending',
        error: null,
        logs: [],
      });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 720, width: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Edit & re-render</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Uses cached TTS + HeyGen clips — only re-runs ffmpeg. Costs nothing.
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 10px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Title */}
          <div style={col}>
            <Section>Title overlay</Section>
            <label style={check}>
              <input type="checkbox" checked={!!titleS.enabled}
                onChange={e => setTitleS({ ...titleS, enabled: e.target.checked })} />
              Burn title onto video
            </label>
            <Label>Title text</Label>
            <textarea value={title} onChange={e => setTitle(e.target.value)}
              rows={2} style={{ ...input, resize: 'vertical' }} placeholder="e.g. effort. environment. presentation." />
            <Label>Font</Label>
            <select value={titleS.font || 'montserrat'} onChange={e => setTitleS({ ...titleS, font: e.target.value })} style={input}>
              {FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <div style={row2}>
              <div>
                <Label>Text</Label>
                <input type="color" value={titleS.color || '#FFFFFF'} onChange={e => setTitleS({ ...titleS, color: e.target.value })} style={color} />
              </div>
              <div>
                <Label>Background</Label>
                <input type="color" value={titleS.bg_color || '#E91E63'} onChange={e => setTitleS({ ...titleS, bg_color: e.target.value })} style={color} />
              </div>
            </div>
            <Label>{`Size (${titleS.size || 72}px)`}</Label>
            <input type="range" min={40} max={140} step={2} value={titleS.size || 72}
              onChange={e => setTitleS({ ...titleS, size: Number(e.target.value) })} style={{ width: '100%' }} />
            <Label>{`Y position (${Math.round((titleS.y_position ?? 0.12) * 100)}% from top)`}</Label>
            <input type="range" min={0.02} max={0.6} step={0.01} value={titleS.y_position ?? 0.12}
              onChange={e => setTitleS({ ...titleS, y_position: Number(e.target.value) })} style={{ width: '100%' }} />
            <label style={check}>
              <input type="checkbox" checked={!!titleS.uppercase}
                onChange={e => setTitleS({ ...titleS, uppercase: e.target.checked })} /> UPPERCASE
            </label>
          </div>

          {/* Captions + music + logo */}
          <div style={col}>
            <Section>Captions</Section>
            <Label>Font</Label>
            <select value={capS.font || 'montserrat'} onChange={e => setCapS({ ...capS, font: e.target.value })} style={input}>
              {FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <Label>Words per chunk</Label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setCapS({ ...capS, words_per_chunk: n })}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: capS.words_per_chunk === n ? 'var(--orange)' : 'var(--surface-3)',
                    color: capS.words_per_chunk === n ? '#fff' : 'var(--muted)',
                  }}>{n}</button>
              ))}
            </div>
            <Label>{`Size (${capS.size}px)`}</Label>
            <input type="range" min={32} max={120} step={2} value={capS.size}
              onChange={e => setCapS({ ...capS, size: Number(e.target.value) })} style={{ width: '100%' }} />
            <div style={row2}>
              <div>
                <Label>Text</Label>
                <input type="color" value={capS.color} onChange={e => setCapS({ ...capS, color: e.target.value })} style={color} />
              </div>
              <div>
                <Label>Outline</Label>
                <input type="color" value={capS.stroke || '#000000'} onChange={e => setCapS({ ...capS, stroke: e.target.value })} style={color} />
              </div>
            </div>
            <Label>{`Outline thickness (${capS.stroke_width ?? 6}px)`}</Label>
            <input type="range" min={0} max={16} step={1} value={capS.stroke_width ?? 6}
              onChange={e => setCapS({ ...capS, stroke_width: Number(e.target.value) })} style={{ width: '100%' }} />

            <Section>Logo</Section>
            <Label>Position</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {[
                { k: 'tl', l: 'Top Left' }, { k: 'tr', l: 'Top Right' },
                { k: 'bl', l: 'Bottom Left' }, { k: 'br', l: 'Bottom Right' },
              ].map(p => (
                <button key={p.k} onClick={() => setLogoPos(p.k)}
                  style={{
                    padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', border: 'none',
                    background: logoPos === p.k ? 'var(--orange)' : 'var(--surface-3)',
                    color: logoPos === p.k ? '#fff' : 'var(--muted)',
                  }}>{p.l}</button>
              ))}
            </div>

            <Section>Music</Section>
            <Label>{`Volume (${Math.round(musicVol * 100)}%)`}</Label>
            <input type="range" min={0} max={1} step={0.05} value={musicVol}
              onChange={e => setMusicVol(Number(e.target.value))} style={{ width: '100%' }} />
            <Label>{`Fade-out (${musicFade.toFixed(1)}s)`}</Label>
            <input type="range" min={0} max={5} step={0.1} value={musicFade}
              onChange={e => setMusicFade(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Re-queues the render with your changes. Worker will skip TTS + HeyGen and re-stitch only.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={saving} className="btn-ghost">Cancel</button>
            <button onClick={handleSaveAndRerender} disabled={saving}
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="spin" /> : <RotateCcw size={13} />}
              {saving ? 'Queueing…' : 'Save & re-render'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginTop: 6, marginBottom: 4 }}>{children}</div>;
}

function Section({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text)', paddingTop: 6, marginTop: 2, marginBottom: 4,
      borderTop: '1px solid var(--border)',
    }}>{children}</div>
  );
}

const input = {
  width: '100%', padding: '6px 8px', borderRadius: 6,
  background: 'var(--surface-3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12,
  fontFamily: 'var(--font-display)', outline: 'none',
};

const color = { ...input, height: 30, padding: 2 };

const col  = { display: 'flex', flexDirection: 'column', gap: 2 };
const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const check = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer', marginTop: 4 };
