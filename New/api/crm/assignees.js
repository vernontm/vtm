// Lightweight team roster for "assign to" pickers across the CRM.
//
// Unlike /employees (admin-only, and enriched with pay rates, hours, and
// contract status), this returns just the fields an assignee dropdown needs and
// is readable by any signed-in CRM user. An appointment setter has to be able to
// assign a lead to a teammate without being able to see payroll.
const { setCors, requireStaff, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireStaff(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    // Active roster only (null status counts as active so freshly added people
    // still show up). No pay, hours, or contract data leaves this endpoint.
    const rows = await supaFetch(
      'crm_team_members?or=(status.is.null,status.eq.active)&order=name.asc&select=id,name,email,kind,user_id'
    ) || [];
    return res.json(rows);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
