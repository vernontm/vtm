const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const HEYGEN_BASE = 'https://api.heygen.com';
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

async function heygen(path, opts = {}) {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...opts,
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || res.statusText;
    throw new Error(`HeyGen ${res.status}: ${msg}`);
  }
  return json;
}

// Unwraps HeyGen's inconsistent response shapes into a flat list.
function flat(resp) {
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.data?.avatar_group_list)) return resp.data.avatar_group_list;
  if (Array.isArray(resp?.data?.avatar_list)) return resp.data.avatar_list;
  if (Array.isArray(resp?.data?.photo_avatar_list)) return resp.data.photo_avatar_list;
  if (Array.isArray(resp?.data?.list)) return resp.data.list;
  if (Array.isArray(resp?.avatar_group_list)) return resp.avatar_group_list;
  return [];
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  if (!HEYGEN_API_KEY) {
    return res.status(500).json({ error: 'HEYGEN_API_KEY not set on Vercel' });
  }

  const { action } = req.query;

  try {
    // List all photo avatar groups on the user's HeyGen account
    if (req.method === 'GET' && action === 'groups') {
      const resp = await heygen('/v2/avatar_group.list?include_public=false');
      const groups = flat(resp).map(g => ({
        id: g.id || g.group_id,
        name: g.name,
        thumbnail: g.preview_image_url || g.thumbnail_image_url || g.image_url,
        num_looks: g.num_looks ?? g.looks_count ?? null,
        raw: g,
      }));
      return res.json(groups);
    }

    // List looks inside a specific group
    if (req.method === 'GET' && action === 'looks') {
      const { group_id } = req.query;
      if (!group_id) return res.status(400).json({ error: 'group_id required' });
      const resp = await heygen(`/v2/avatar_group/${group_id}/avatars`);
      const looks = flat(resp).map(l => ({
        id: l.id || l.avatar_id || l.photo_avatar_id,
        name: l.name,
        image_url: l.image_url || l.preview_image_url || l.normal_preview,
        raw: l,
      }));
      return res.json(looks);
    }

    // Import: create/link an avatar row and bulk-insert its looks from HeyGen.
    // Body: { name, heygen_group_id, elevenlabs_voice_id?, looks: [{heygen_look_id, image_url, name}] }
    if (req.method === 'POST' && action === 'import') {
      const body = req.body || {};
      const { name, heygen_group_id, elevenlabs_voice_id, looks = [] } = body;
      if (!heygen_group_id) return res.status(400).json({ error: 'heygen_group_id required' });

      // Upsert-by-group: if an avatar row already exists for this group, reuse it
      const existing = await supaFetch(`crm_avatars?heygen_group_id=eq.${heygen_group_id}`);
      let avatar;
      if (existing[0]) {
        avatar = existing[0];
        if (elevenlabs_voice_id && !avatar.elevenlabs_voice_id) {
          const upd = await supaFetch(`crm_avatars?id=eq.${avatar.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ elevenlabs_voice_id }),
          });
          avatar = upd[0] || avatar;
        }
      } else {
        const created = await supaFetch('crm_avatars', {
          method: 'POST',
          body: JSON.stringify({ name: name || 'Imported Avatar', heygen_group_id, elevenlabs_voice_id: elevenlabs_voice_id || null }),
        });
        avatar = created[0];
      }

      // Bulk insert looks; ON CONFLICT handled by unique index on (avatar_id, heygen_look_id)
      if (looks.length) {
        const rows = looks
          .filter(l => l.heygen_look_id && l.image_url)
          .map((l, i) => ({
            avatar_id: avatar.id,
            heygen_look_id: l.heygen_look_id,
            image_url: l.image_url,
            angle_order: i,
          }));
        if (rows.length) {
          await supaFetch('crm_avatar_looks', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation,resolution=ignore-duplicates' },
            body: JSON.stringify(rows),
          });
        }
      }

      const finalLooks = await supaFetch(`crm_avatar_looks?avatar_id=eq.${avatar.id}&order=angle_order.asc`);
      return res.json({ avatar, looks: finalLooks });
    }

    return res.status(400).json({ error: 'Unknown action. Use ?action=groups | looks | import' });
  } catch (err) {
    console.error('avatar-heygen error:', err);
    return res.status(500).json({ error: err.message || 'HeyGen request failed' });
  }
};
