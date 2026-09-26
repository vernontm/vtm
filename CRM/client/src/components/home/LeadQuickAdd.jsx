import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Check, Loader } from 'lucide-react';
import { createClient } from '../../api';
import { Tile, TileHead, EmptyNote, GREEN } from './shared';

// Add a lead in one line: a name, a number, an @handle or a profile link.
// The chips say where it came from; Paste a DM takes a whole message and
// keeps it as the notes. A name or a number is enough, the rest comes later.
// Same parsing as mobile/components/homes/LeadQuickAdd.js so a lead added on
// the phone and one added here look the same in the CRM.
const MODES = [
  { key: 'tiktok', label: 'From TikTok' },
  { key: 'instagram', label: 'From Instagram' },
  { key: 'dm', label: 'Paste a DM' },
];
const LINK_RE = /(tiktok\.com|instagram\.com)\/@?([A-Za-z0-9._]+)/i;
const HANDLE_RE = /^@([A-Za-z0-9._]{2,40})$/;

// US numbers go out as +1 and ten digits, the shape the texting bridge uses.
const normalizePhone = (digits) => {
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return `+${digits}`;
};
const prettyPhone = (digits) => {
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : digits;
};

// One value (a line) into the fields it fills. `platform` is the selected
// chip (tiktok or instagram) or null for a pasted DM.
function parseValue(text, platform) {
  const digits = text.replace(/[\s().+-]/g, '');
  if (/^\d{7,15}$/.test(digits)) {
    return { business_name: prettyPhone(digits), owner_name: '', contact_phone: normalizePhone(digits), source: platform || 'manual' };
  }
  const link = text.match(LINK_RE);
  if (link) {
    const from = link[1].toLowerCase().startsWith('tiktok') ? 'tiktok' : 'instagram';
    return { business_name: `@${link[2]}`, owner_name: '', [from]: text, source: from };
  }
  const handle = text.match(HANDLE_RE);
  if (handle) {
    const from = platform || 'tiktok';
    return { business_name: `@${handle[1]}`, owner_name: '', [from]: `@${handle[1]}`, source: from };
  }
  return { business_name: text, owner_name: text, source: platform || 'manual' };
}

// The whole input into the createClient body, or null when there is nothing.
export function parseLead(raw, mode) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (mode === 'dm') {
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const first = lines[0] || text;
    const hint = /tiktok/i.test(text) ? 'tiktok' : /instagram/i.test(text) ? 'instagram' : null;
    return { ...parseValue(first, hint), notes: text, stage: 'lead' };
  }
  return { ...parseValue(text, mode), stage: 'lead' };
}

export default function LeadQuickAdd({ startCount = 0, to = '/leads', full = true }) {
  const [mode, setMode] = useState('tiktok');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(null);
  const [addedToday, setAddedToday] = useState(0);
  const [err, setErr] = useState('');

  const dm = mode === 'dm';
  const canAdd = !!value.trim() && !busy;
  const total = (Number(startCount) || 0) + addedToday;

  const add = async (e) => {
    e?.preventDefault?.();
    const body = parseLead(value, mode);
    if (!body || busy) return;
    setBusy(true); setErr('');
    try {
      await createClient(body);
      setValue('');
      setAddedToday(n => n + 1);
      setAdded(body.business_name);
    } catch (e2) {
      setErr(e2.message || 'Could not add the lead');
    } finally { setBusy(false); }
  };

  return (
    <Tile full={full}>
      <TileHead label="Add a lead" right={`Today: ${total} added`} />
      <form onSubmit={add} style={{ display: 'flex', alignItems: dm ? 'flex-end' : 'center', gap: 8 }}>
        {dm ? (
          <textarea className="home-input" rows={3} value={value} onChange={e => setValue(e.target.value)}
            placeholder="Paste the message. The first line becomes the name"
            style={{ resize: 'vertical', minHeight: 70, lineHeight: 1.45 }} />
        ) : (
          <input className="home-input" value={value} onChange={e => setValue(e.target.value)}
            placeholder="Name, number, @handle or link" autoComplete="off" />
        )}
        <button type="submit" className="home-pill" disabled={!canAdd} style={{ padding: '9px 14px' }}>
          {busy ? <Loader size={13} /> : <Plus size={13} />} Add
        </button>
      </form>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MODES.map(m => {
          const on = mode === m.key;
          return (
            <button key={m.key} type="button" onClick={() => setMode(m.key)} style={{
              padding: '4px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              background: on ? 'var(--btn-black)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--muted)',
              border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
            }}>{m.label}</button>
          );
        })}
      </div>
      {err ? <EmptyNote><span style={{ color: '#dc2626' }}>{err}</span></EmptyNote>
        : added ? (
          <div className="home-clip" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: GREEN }}>
            <Check size={13} /> <span className="private-value">Added {added}</span>
          </div>
        ) : <EmptyNote>A name or a number is enough. Add the rest later.</EmptyNote>}
      <Link to={to} className="home-link" style={{ alignSelf: 'flex-start' }}>Open the leads list &rarr;</Link>
    </Tile>
  );
}
