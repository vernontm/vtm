import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces } from '../lib/api';
import { C } from '../lib/theme';

// Location field with autocomplete, same behavior as the web CRM's picker:
// type a business or address, pick the real one. Results come from the
// server's places proxy (Google Places when GOOGLE_MAPS_KEY is set, the
// keyless OpenStreetMap geocoder otherwise); if the proxy is unavailable the
// field asks OpenStreetMap directly so it never sits silent.
const OSM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&countrycodes=us';
const BOX = '-96.3,30.3,-95.0,29.3';   // the Houston area, where the meetups happen

async function osmFetch(params) {
  const r = await fetch(`${OSM}&${params}`, { headers: { Accept: 'application/json' } });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// A bare business name only geocodes inside a box ("Topgolf" in the Houston
// box finds the Katy one), so search the box and the country together.
async function osmSearch(q) {
  const enc = encodeURIComponent(q);
  const [local, wide] = await Promise.all([
    osmFetch(`q=${enc}&viewbox=${BOX}&bounded=1`).catch(() => []),
    osmFetch(`q=${enc}&viewbox=${BOX}`).catch(() => []),
  ]);
  // De-dupe on the OSM object, not place_id (that differs per Nominatim server).
  const seen = new Set();
  const key = (x) => `${x.osm_type}/${x.osm_id}`;
  return [...local, ...wide].filter(x => !seen.has(key(x)) && seen.add(key(x))).slice(0, 6).map(x => {
    const parts = String(x.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
    const label = x.name || parts[0] || x.display_name;
    const rest = parts.filter(p => p !== label && !/County$/.test(p) && p !== 'United States').slice(0, 4).join(', ');
    return { label, sub: rest, value: [label, rest].filter(Boolean).join(', ') };
  });
}

export default function LocationInput({ value, onChange, placeholder = 'Business or address', style }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const seq = useRef(0);   // ignore responses from searches the user has typed past

  useEffect(() => () => clearTimeout(timer.current), []);

  const onInput = (v) => {
    onChange(v); setOpen(true);
    clearTimeout(timer.current);
    if (v.trim().length < 3) { setResults([]); setLoading(false); return; }
    timer.current = setTimeout(async () => {
      const mine = ++seq.current;
      setLoading(true);
      try {
        let out = null;
        try {
          const g = await searchPlaces(v.trim());
          if (g && g.configured) out = (g.results || []).map(r => ({ label: r.main, sub: r.secondary, value: r.description }));
        } catch { out = null; }
        if (out === null) out = await osmSearch(v.trim());
        if (mine === seq.current) setResults(out);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 350);
  };

  const pick = (r) => { onChange(r.value); setResults([]); setOpen(false); };

  return (
    <View>
      <TextInput style={style} placeholder={placeholder} placeholderTextColor={C.muted} value={value || ''} onChangeText={onInput}
        onFocus={() => { if (results.length) setOpen(true); }} autoCorrect={false} autoCapitalize="words" />
      {open && (loading || results.length > 0) && (
        <View style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, marginTop: 6 }}>
          {loading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12 }}>
              <ActivityIndicator size="small" color={C.muted} />
              <Text style={{ color: C.muted, fontSize: 12.5 }}>Searching…</Text>
            </View>
          )}
          {!loading && results.map((r, i) => (
            <TouchableOpacity key={`${r.value}-${i}`} onPress={() => pick(r)} accessibilityLabel={`Use ${r.label}`}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
              <Ionicons name="location" size={14} color={C.amber} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>{r.label}</Text>
                {r.sub ? <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>{r.sub}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
