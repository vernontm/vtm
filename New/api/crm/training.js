import { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';

const ANON_KEY = process.env.CRM_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

async function getUserEmail(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': ANON_KEY || SERVICE_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user.email || null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    // ── GET: list all videos with current user's progress ─────────────────────
    if (req.method === 'GET') {
      const email = await getUserEmail(req);
      const videos = await supaFetch('crm_training_videos?order=position.asc,created_at.asc');
      let progress = [];
      if (email) {
        progress = await supaFetch(
          `crm_training_progress?user_email=eq.${encodeURIComponent(email)}`
        ).catch(() => []);
      }
      const progressMap = {};
      for (const p of (progress || [])) progressMap[p.video_id] = p;
      return res.json((videos || []).map(v => ({ ...v, progress: progressMap[v.id] || null })));
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {

      // Get a signed upload URL for direct-to-storage upload
      if (action === 'upload-url') {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ error: 'filename required' });
        const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const uploadRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/sign/upload/training-videos/${safeName}`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: '{}' }
        );
        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          throw new Error(`Storage sign error: ${err}`);
        }
        const { signedURL } = await uploadRes.json();
        return res.json({
          signedUrl: signedURL,
          path: safeName,
          publicUrl: `${SUPABASE_URL}/storage/v1/object/public/training-videos/${safeName}`,
        });
      }

      // Create video record after upload
      if (action === 'create') {
        const { title, description = '', category = 'General', path, video_url, duration_seconds = 0 } = req.body;
        if (!title) return res.status(400).json({ error: 'title required' });
        const url = video_url || (path ? `${SUPABASE_URL}/storage/v1/object/public/training-videos/${path}` : null);
        if (!url) return res.status(400).json({ error: 'path or video_url required' });

        // Set position to end of list
        const existing = await supaFetch('crm_training_videos?select=position&order=position.desc&limit=1').catch(() => []);
        const position = ((existing || [])[0]?.position ?? -1) + 1;

        const result = await supaFetch('crm_training_videos', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify({ title, description, category, video_url: url, duration_seconds, position }),
        });
        return res.status(201).json(result[0] || result);
      }

      // Save / upsert watch progress
      if (action === 'progress') {
        const email = await getUserEmail(req);
        if (!email) return res.status(401).json({ error: 'Unauthorized' });
        const { video_id, watched_seconds, completed = false } = req.body;
        if (!video_id) return res.status(400).json({ error: 'video_id required' });
        const result = await supaFetch('crm_training_progress', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify({
            user_email: email, video_id, watched_seconds,
            completed, updated_at: new Date().toISOString(),
          }),
        });
        return res.json(result[0] || result);
      }
    }

    // ── PATCH: update video metadata ──────────────────────────────────────────
    if (req.method === 'PATCH' && id) {
      const { id: _, ...data } = req.body;
      const result = await supaFetch(`crm_training_videos?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    // ── DELETE: remove video + storage file ───────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const [video] = await supaFetch(`crm_training_videos?id=eq.${id}`).catch(() => [null]);
      if (video?.video_url) {
        const match = video.video_url.match(/training-videos\/(.+)$/);
        if (match) {
          await fetch(`${SUPABASE_URL}/storage/v1/object/training-videos/${match[1]}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}` },
          }).catch(() => {});
        }
      }
      await supaFetch(`crm_training_videos?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Training error:', err);
    return res.status(500).json({ error: err.message });
  }
}
