// The people who work for VTM: staff and contractors.
//
//   GET                      -> roster, with hours this month and contract status
//   POST                     -> add someone (no login required)
//   PATCH  ?id=              -> edit their details
//   DELETE ?id=              -> remove the roster entry (never deletes their login)
//   POST   ?action=invite&id= -> create their login and mail a set-password link
//
// A roster entry can exist before a login does, which is the point: someone is
// hired, signs, and starts being tracked before anyone gets round to creating
// an account for them. user_id stays null until they are invited.
//
// This is deliberately NOT the login list. Clients hold logins too, and they
// have no business appearing on a page about employees.
const { setCors, requireStaff, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function adminFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.msg || body?.error || `auth admin error ${res.status}`);
  return body;
}

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });

  const { id, action } = req.query;
  if (id && !UUID_RE.test(id)) return res.status(400).json({ error: 'Bad id' });

  try {
    // ── GET: the roster, enriched ─────────────────────────────────────────
    if (req.method === 'GET') {
      const rows = await supaFetch('crm_team_members?order=status.asc,name.asc') || [];
      const withLogin = rows.filter(r => r.user_id).map(r => r.user_id);

      // Hours logged this month, per person.
      let hours = {};
      if (withLogin.length) {
        const entries = await supaFetch(
          `crm_time_entries?user_id=in.(${withLogin.join(',')})&work_date=gte.${monthStart()}&select=user_id,minutes,billable_minutes,status`
        ).catch(() => []) || [];
        for (const e of entries) {
          const mins = e.billable_minutes || e.minutes || 0;
          if (!hours[e.user_id]) hours[e.user_id] = { minutes: 0, unpaid_minutes: 0 };
          hours[e.user_id].minutes += mins;
          if (e.status !== 'paid') hours[e.user_id].unpaid_minutes += mins;
        }
      }

      // Has this person signed a contractor agreement with us?
      const agreements = await supaFetch(
        `crm_agreements?client_id=is.null&select=id,title,status,signed_at,sign_token,terms`
      ).catch(() => []) || [];
      const byEmail = {};
      for (const a of agreements) {
        const em = (a.terms?.signer?.email || '').toLowerCase();
        if (!em) continue;
        // keep the most recently signed one
        if (!byEmail[em] || (a.signed_at || '') > (byEmail[em].signed_at || '')) byEmail[em] = a;
      }

      return res.json({
        employees: rows.map(r => {
          const h = hours[r.user_id] || { minutes: 0, unpaid_minutes: 0 };
          const ag = byEmail[(r.email || '').toLowerCase()];
          return {
            ...r,
            has_login: !!r.user_id,
            hours_this_month: Math.round((h.minutes / 60) * 100) / 100,
            unpaid_hours: Math.round((h.unpaid_minutes / 60) * 100) / 100,
            agreement: ag ? { id: ag.id, title: ag.title, status: ag.status, signed_at: ag.signed_at, token: ag.sign_token } : null,
          };
        }),
      });
    }

    // ── POST: add someone, or invite an existing entry ────────────────────
    if (req.method === 'POST' && action === 'invite') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const [emp] = await supaFetch(`crm_team_members?id=eq.${id}`);
      if (!emp) return res.status(404).json({ error: 'Not found' });
      if (!EMAIL_RE.test(emp.email || '')) return res.status(400).json({ error: 'That person needs a valid email first.' });

      let uid = emp.user_id;
      if (!uid) {
        try {
          const created = await adminFetch('users', {
            method: 'POST',
            body: JSON.stringify({ email: emp.email, email_confirm: true, user_metadata: { allowed_pages_global: ['time'] } }),
          });
          uid = created?.id;
        } catch (e) {
          // Already has an account: adopt it rather than failing.
          const existing = await adminFetch('users?per_page=200').catch(() => null);
          const found = (existing?.users || []).find(u => (u.email || '').toLowerCase() === emp.email.toLowerCase());
          if (!found) throw e;
          uid = found.id;
        }
      }

      // The time screen reads rates by user_id, so push the roster rate across
      // now that there is an id to key it on.
      if (uid && emp.hourly_rate != null) {
        await supaFetch('crm_employee_rates?on_conflict=user_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: uid, hourly_rate: Number(emp.hourly_rate) || 0, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      }

      const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
      const link = await adminFetch('generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'recovery', email: emp.email, options: { redirect_to: origin + '/admin' } }),
      }).catch(() => null);

      await supaFetch(`crm_team_members?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: uid, invite_status: 'active' }),
      });

      return res.json({ ok: true, user_id: uid, action_link: link?.action_link || link?.properties?.action_link || null });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'A name is required.' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required.' });

      const [created] = await supaFetch('crm_team_members', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          email, name,
          role: b.role || 'member',
          kind: b.kind === 'staff' ? 'staff' : 'contractor',
          title: b.title || null,
          hourly_rate: b.hourly_rate === '' || b.hourly_rate == null ? null : Number(b.hourly_rate),
          started_on: b.started_on || null,
          status: 'active',
          invite_status: 'pending',
        }),
      });
      return res.status(201).json(created);
    }

    if (req.method === 'PATCH' && id) {
      const b = req.body || {};
      const patch = {};
      if (b.name != null) { const n = String(b.name).trim(); if (!n) return res.status(400).json({ error: 'Name cannot be empty.' }); patch.name = n; }
      if (b.email != null) { const e = String(b.email).trim().toLowerCase(); if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'That email is not valid.' }); patch.email = e; }
      if (b.title !== undefined) patch.title = b.title || null;
      if (b.kind != null) patch.kind = b.kind === 'staff' ? 'staff' : 'contractor';
      if (b.status != null) patch.status = b.status === 'inactive' ? 'inactive' : 'active';
      if (b.started_on !== undefined) patch.started_on = b.started_on || null;
      if (b.notes !== undefined) patch.notes = b.notes || null;
      if (b.hourly_rate !== undefined) patch.hourly_rate = b.hourly_rate === '' || b.hourly_rate == null ? null : Number(b.hourly_rate);

      const [updated] = await supaFetch(`crm_team_members?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });

      // Keep the rate the time screen uses in step with the roster.
      if (updated?.user_id && patch.hourly_rate !== undefined && patch.hourly_rate != null) {
        await supaFetch('crm_employee_rates?on_conflict=user_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id: updated.user_id, hourly_rate: Number(patch.hourly_rate) || 0, updated_at: new Date().toISOString() }),
        }).catch(() => {});
      }
      return res.json(updated);
    }

    // Removing someone from the roster leaves their login and their logged time
    // alone. Deleting an account is a separate, deliberate act on Admin Users.
    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_team_members?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('employees error:', err);
    return res.status(500).json({ error: err.message });
  }
};
