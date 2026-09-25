const { setCors, requireAuth } = require('../_lib/supabase.js');

// Google Places proxy so the browser never sees the key. Powers the location
// picker on the Schedule Meeting form: type a business or address, get real
// Google Maps results (business name + address) to pick from.
//   GET ?q=<text>        -> autocomplete predictions
//   GET ?place_id=<id>   -> details (name + formatted address) for one result
// Returns { configured:false } when GOOGLE_MAPS_KEY is not set, so the client
// can fall back to its keyless geocoder.
const KEY = process.env.GOOGLE_MAPS_KEY;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (!KEY) return res.json({ configured: false, results: [] });

  try {
    const placeId = String(req.query.place_id || '').trim();
    if (placeId) {
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,formatted_address,geometry&key=${KEY}`);
      const d = await r.json();
      const p = d.result || {};
      return res.json({ configured: true, detail: { name: p.name || '', address: p.formatted_address || '', lat: p.geometry?.location?.lat ?? null, lng: p.geometry?.location?.lng ?? null } });
    }

    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ configured: true, results: [] });
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:us&key=${KEY}`);
    const d = await r.json();
    if (d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS') {
      // e.g. REQUEST_DENIED (Places API not enabled / billing). Let the client fall back.
      return res.json({ configured: false, results: [], status: d.status });
    }
    const results = (d.predictions || []).slice(0, 6).map(p => ({
      place_id: p.place_id,
      main: p.structured_formatting?.main_text || p.description,
      secondary: p.structured_formatting?.secondary_text || '',
      description: p.description,
    }));
    return res.json({ configured: true, results });
  } catch (e) {
    return res.json({ configured: false, results: [], error: e.message });
  }
};
