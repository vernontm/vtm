// Claude Code working directories available to link to a project.
//
// The CRM runs on Vercel and cannot see anyone's local disk, so this list is
// published from the machine itself by tools/claude-sync.mjs (on every sync, or
// with --publish). Read-only here: the picker offers what that script found.

import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rows = await supaFetch('crm_claude_workspaces?order=last_active.desc,path.asc');
    return res.json(rows || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
