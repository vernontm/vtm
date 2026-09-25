import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader } from 'lucide-react';
import { searchPlaces } from '../api';

// Location field with autocomplete. Prefers Google Places (real businesses and
// addresses) through the server proxy, and falls back to the keyless
// OpenStreetMap geocoder when GOOGLE_MAPS_KEY is not configured.
export default function LocationInput({ value, onChange, placeholder = 'Business or address…', style }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const h = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const onInput = (v) => {
    onChange(v); setOpen(true);
    clearTimeout(timer.current);
    if (v.trim().length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        let out = null;
        try {
          const g = await searchPlaces(v.trim());
          if (g && g.configured) out = (g.results || []).map(r => ({ label: r.main, sub: r.secondary, value: r.description }));
        } catch { out = null; }
        if (out === null) {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&countrycodes=us&q=${encodeURIComponent(v.trim())}`, { headers: { Accept: 'application/json' } });
          const j = await r.json();
          out = (j || []).map(x => ({ label: x.display_name, sub: '', value: x.display_name }));
        }
        setResults(out);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input value={value || ''} onChange={e => onInput(e.target.value)} onFocus={() => (value || '').trim().length >= 3 && setOpen(true)}
        placeholder={placeholder} style={style} />
      {open && (loading || results.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 9600, maxHeight: 220, overflow: 'auto' }}>
          {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}><Loader size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> Searching…</div>}
          {!loading && results.map((a, i) => (
            <div key={i} onClick={() => { onChange(a.value); setResults([]); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none', lineHeight: 1.4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
              <MapPin size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--orange)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{a.label}</span>
                {a.sub ? <span style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>{a.sub}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
