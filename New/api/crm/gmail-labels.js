import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth, getOrCreateLabel, listLabels, listDisplayLabels, deleteLabel, modifyMessageLabels } from '../_lib/gmail.js';

// Real Gmail label sync. Custom labels created here are created in Gmail
// itself (not a CRM-only concept), and this always reads the live Gmail
// label list — so labels Ray creates directly in Gmail show up here too,
// and labels created here show up in Gmail. `crm_label_defs` only stores
// the color we picked for a label, keyed by the real Gmail label id.
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { action, id } = req.query;

  try {
    if (req.method === 'GET') {
      const [gmailLabels, colorDefs] = await Promise.all([
        listDisplayLabels(),
        supaFetch('crm_label_defs?select=gmail_label_id,color').catch(() => []),
      ]);
      const colorMap = {};
      (colorDefs || []).forEach(d => { if (d.gmail_label_id) colorMap[d.gmail_label_id] = d.color; });
      const labels = gmailLabels
        .map(l => ({ id: l.id, name: l.name, system: !!l.system, color: colorMap[l.id] || l.color || '#4a6cf7' }))
        .sort((a, b) => (a.system === b.system ? a.name.localeCompare(b.name) : (a.system ? 1 : -1)));
      return res.json(labels);
    }

    if (req.method === 'POST' && action === 'apply') {
      const { message_id, label_id } = req.body || {};
      if (!message_id || !label_id) return res.status(400).json({ error: 'message_id and label_id required' });
      await modifyMessageLabels(message_id, { addLabelIds: [label_id] });
      await syncCacheLabel(message_id, label_id, 'add');
      return res.json({ success: true });
    }

    if (req.method === 'POST' && action === 'remove') {
      const { message_id, label_id } = req.body || {};
      if (!message_id || !label_id) return res.status(400).json({ error: 'message_id and label_id required' });
      await modifyMessageLabels(message_id, { removeLabelIds: [label_id] });
      await syncCacheLabel(message_id, label_id, 'remove');
      return res.json({ success: true });
    }

    if (req.method === 'POST') {
      const { name, color } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
      const { accessToken } = await getGmailAuth();
      const gmailLabelId = await getOrCreateLabel(accessToken, name.trim());

      const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const existing = await supaFetch(`crm_label_defs?gmail_label_id=eq.${gmailLabelId}`).catch(() => []);
      if (existing?.length) {
        const updated = await supaFetch(`crm_label_defs?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ color: color || existing[0].color }),
        });
        return res.status(200).json({ id: gmailLabelId, name: name.trim(), color: (updated[0] || existing[0]).color });
      }
      await supaFetch('crm_label_defs', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), key, color: color || '#4a6cf7', gmail_label_id: gmailLabelId }),
      });
      return res.status(201).json({ id: gmailLabelId, name: name.trim(), color: color || '#4a6cf7' });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id (gmail label id) required' });
      await deleteLabel(id).catch(err => console.warn('Gmail label delete warning:', err.message));
      await supaFetch(`crm_label_defs?gmail_label_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Gmail labels error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

// Keep the cached inbox list's label_ids in sync so the UI reflects an
// apply/remove immediately, without waiting for the next full Gmail resync.
async function syncCacheLabel(messageId, labelId, mode) {
  try {
    const [cached] = await supaFetch(`crm_gmail_cache?gmail_id=eq.${messageId}&select=label_ids`);
    if (!cached) return;
    const current = Array.isArray(cached.label_ids) ? cached.label_ids : [];
    const next = mode === 'add'
      ? (current.includes(labelId) ? current : [...current, labelId])
      : current.filter(l => l !== labelId);
    await supaFetch(`crm_gmail_cache?gmail_id=eq.${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ label_ids: next }),
    });
  } catch (err) {
    console.warn('Cache label sync warning:', err.message);
  }
}
