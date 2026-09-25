const { setCors, requireAuth } = require('../_lib/supabase.js');

// Places proxy behind the location pickers (web Schedule / Edit meeting, the
// app's appointment sheet): type a business or address, pick the real one.
// Google Places (real Google Maps businesses + addresses) when GOOGLE_MAPS_KEY
// is set; otherwise the keyless OpenStreetMap geocoder, so the pickers always
// suggest something and the key never reaches a client.
//   GET ?q=<text>        -> { configured, source:'google'|'osm', results:[{place_id, main, secondary, description}] }
//   GET ?place_id=<id>   -> details (name + formatted address) for one Google result
// Results are biased toward the Katy / Houston area, where the meetups happen.
const KEY = process.env.GOOGLE_MAPS_KEY;
const BIAS = { lat: 29.79, lng: -95.75, radius: 60000 };
const OSM_VIEWBOX = '-96.3,30.3,-95.0,29.3';   // left,top,right,bottom around Houston
const OSM_UA = 'VernonTM-CRM/1.0 (+https://vernontm.com)';

async function googleSearch(q) {
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:us&location=${BIAS.lat},${BIAS.lng}&radius=${BIAS.radius}&key=${KEY}`);
  const d = await r.json();
  // e.g. REQUEST_DENIED (Places API not enabled / billing): let the caller fall back.
  if (d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS') throw new Error(d.status);
  return (d.predictions || []).slice(0, 6).map(p => ({
    place_id: p.place_id,
    main: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || '',
    description: p.description,
  }));
}

// "Topgolf, 1030, Memorial Brook Boulevard, Houston, Harris County, Texas, 77084, United States"
// becomes main "Topgolf", secondary "1030 Memorial Brook Boulevard, Houston, Texas 77084".
function osmResult(x) {
  const a = x.address || {};
  const parts = String(x.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const city = a.city || a.town || a.village || a.hamlet || a.county || '';
  const stateZip = [a.state, a.postcode].filter(Boolean).join(' ');
  const addr = [street, city, stateZip].filter(Boolean).join(', ');
  const name = x.name && x.name !== street && x.name !== a.road ? x.name : '';
  const main = name || street || parts[0] || x.display_name;
  const secondary = addr && addr !== main ? addr : (name ? '' : parts.slice(1, 4).join(', '));
  return { place_id: `osm:${x.place_id}`, main, secondary, description: [main, secondary].filter(Boolean).join(', ') };
}

async function osmFetch(params) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=us&${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': OSM_UA },
  });
  if (!r.ok) throw new Error(`osm ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// Nominatim is a geocoder, so a bare business name only finds anything when
// the search is boxed to an area: "Topgolf" inside the Houston box finds the
// Katy location, while "Topgolf Katy" nationwide finds nothing. Search the
// box and the whole country together, local hits first.
async function osmSearch(q) {
  const enc = encodeURIComponent(q);
  const [local, wide] = await Promise.all([
    osmFetch(`q=${enc}&viewbox=${OSM_VIEWBOX}&bounded=1`).catch(() => []),
    osmFetch(`q=${enc}&viewbox=${OSM_VIEWBOX}`).catch(() => []),
  ]);
  let rows = [...local, ...wide];
  // "Topgolf Katy" style queries: retry the box without the trailing place word.
  if (!rows.length && /\s/.test(q)) rows = await osmFetch(`q=${encodeURIComponent(q.replace(/\s+\S+$/, ''))}&viewbox=${OSM_VIEWBOX}&bounded=1`).catch(() => []);
  // De-dupe on the OSM object, not place_id (that differs per Nominatim server).
  const seen = new Set();
  const key = (x) => `${x.osm_type}/${x.osm_id}`;
  return rows.filter(x => !seen.has(key(x)) && seen.add(key(x))).slice(0, 6).map(osmResult);
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const placeId = String(req.query.place_id || '').trim();
    if (placeId) {
      if (!KEY || placeId.startsWith('osm:')) return res.json({ configured: false, detail: null });
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${KEY}`);
      const d = await r.json();
      const p = d.result || {};
      return res.json({ configured: true, detail: { name: p.name || '', address: p.formatted_address || '', lat: p.geometry?.location?.lat ?? null, lng: p.geometry?.location?.lng ?? null } });
    }

    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ configured: true, source: KEY ? 'google' : 'osm', results: [] });

    if (KEY) {
      try {
        return res.json({ configured: true, source: 'google', results: await googleSearch(q) });
      } catch (e) {
        console.warn('[places] google failed, using OpenStreetMap:', e.message);
      }
    }
    return res.json({ configured: true, source: 'osm', results: await osmSearch(q) });
  } catch (e) {
    return res.json({ configured: false, results: [], error: e.message });
  }
};
