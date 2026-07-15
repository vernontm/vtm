const { setCors, requireAuth, supaFetch } = require('./_lib/supabase.js');

// Event resources for the live-event pages (e.g. /workshop).
//   GET  ?slug=katy-ai-workshop        -> public list (attendees see these)
//   POST  (admin)                      -> add a resource
//   PUT   ?id=  (admin)                -> update
//   DELETE ?id= (admin)               -> remove
// Resource kinds: 'code' (copiable snippet), 'link' (PDF/download), 'note' (text).
const clean = (v, max = 20000) => (typeof v === 'string' ? v : '').slice(0, max);

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Public read
    if (req.method === 'GET') {
      const slug = clean(req.query.slug, 80) || 'katy-ai-workshop';
      const rows = await supaFetch(`event_resources?event_slug=eq.${encodeURIComponent(slug)}&order=sort.asc,created_at.asc`).catch(() => []);
      return res.status(200).json({ resources: rows || [] });
    }

    // Writes require an authenticated CRM user (admin).
    if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'POST') {
      if (!body.title || !String(body.title).trim()) return res.status(400).json({ error: 'Title required' });
      const kind = ['code', 'link', 'note'].includes(body.kind) ? body.kind : 'code';
      const rows = await supaFetch('event_resources', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          event_slug: clean(body.event_slug, 80) || 'katy-ai-workshop',
          title: clean(body.title, 200).trim(),
          kind,
          body: clean(body.body) || null,
          url: clean(body.url, 2000) || null,
          language: clean(body.language, 40) || null,
          sort: Number.isFinite(+body.sort) ? +body.sort : 0,
        }),
      });
      return res.status(201).json({ resource: rows[0] });
    }

    if (req.method === 'PUT') {
      const id = clean(req.query.id, 60);
      if (!id) return res.status(400).json({ error: 'id required' });
      const patch = {};
      for (const k of ['title', 'kind', 'body', 'url', 'language', 'sort']) if (k in body) patch[k] = body[k];
      await supaFetch(`event_resources?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query.id, 60);
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`event_resources?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('event-resources error:', e.message);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
