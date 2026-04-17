import { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY, ANON_KEY } from '../_lib/supabase.js';

// Helper: decode the Bearer token and return the user's email from Supabase Auth
async function getEmailFromToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': ANON_KEY || SERVICE_KEY,
      'Authorization': `Bearer ${token}`,
    },
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
    // ── GET ?action=me — return current user's team record ─────────────────────
    if (req.method === 'GET' && action === 'me') {
      const email = await getEmailFromToken(req);
      if (!email) return res.status(401).json({ error: 'Could not resolve user email' });

      const rows = await supaFetch(`crm_team_members?email=eq.${encodeURIComponent(email)}&limit=1`);
      if (rows && rows.length > 0) {
        return res.json(rows[0]);
      }
      // Unregistered user = owner with full access
      return res.json({ role: 'owner', permissions: [] });
    }

    // ── GET (no action) — list all members ────────────────────────────────────
    if (req.method === 'GET') {
      try {
        const members = await supaFetch('crm_team_members?order=created_at.asc');
        return res.json(members || []);
      } catch (e) {
        // Table may not exist yet — return empty array
        if (e.message?.includes('42P01') || e.message?.includes('does not exist')) {
          return res.json([]);
        }
        throw e;
      }
    }

    // ── POST — invite new member ───────────────────────────────────────────────
    if (req.method === 'POST') {
      const { email, name, permissions } = req.body;
      if (!email) return res.status(400).json({ error: 'email is required' });
      if (!name)  return res.status(400).json({ error: 'name is required' });

      const payload = {
        email: email.trim().toLowerCase(),
        name:  name.trim(),
        role:  'admin',
        permissions: permissions || [],
        invite_status: 'pending',
      };

      // Insert into crm_team_members
      const created = await supaFetch('crm_team_members', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(payload),
      });

      // Send Supabase admin invite email
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
      } catch (inviteErr) {
        // Non-fatal: member record was created, invite email failed
        console.warn('Supabase invite email failed:', inviteErr.message);
      }

      return res.status(201).json(Array.isArray(created) ? created[0] : created);
    }

    // ── PATCH ?id=xxx — update name and/or permissions ────────────────────────
    if (req.method === 'PATCH' && id) {
      const { name, permissions } = req.body;
      const updates = {};
      if (name        !== undefined) updates.name        = name;
      if (permissions !== undefined) updates.permissions = permissions;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      const updated = await supaFetch(`crm_team_members?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(updates),
      });
      return res.json(Array.isArray(updated) ? updated[0] : updated);
    }

    // ── DELETE ?id=xxx — remove member ────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_team_members?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM team error:', err);
    return res.status(500).json({ error: err.message });
  }
}
