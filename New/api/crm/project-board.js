// Per-project delivery board: phases, the steps inside them, comments, and a
// period report.
//
//   GET    ?project_id=                      -> { project, phases[], comments[], progress }
//   POST   ?action=seed-template&project_id= -> seed phases/steps from the project kind (idempotent)
//   POST   ?action=item&project_id=          -> add a phase (no parent_id) or a step
//   PATCH  ?id=                              -> rename, move, set status, toggle client_visible
//   DELETE ?id=                              -> remove a step, or a phase and its steps
//   POST   ?action=comment&project_id=       -> { item_id?, body, internal }
//   POST   ?action=report&project_id=        -> { range, from?, to?, client_facing } -> PDF filed as a Document
//
// A phase is a crm_project_items row with parent_id null. A step points at its
// phase. One table keeps ordering, renaming and deletion uniform.
//
// Client safety: steps carry client_visible and comments carry internal.
// Nothing here is what a client actually reads (that is portal-auth.js), but
// the report's client_facing mode filters on both, and the PDF module filters
// again on its own.
const crypto = require('crypto');
const { setCors, requireStaff, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { templateRows } = require('../_lib/project-templates.js');
const { buildProjectReportPdf, resolveRange } = require('../_lib/project-report-pdf.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'client-agreements';
const STATUSES = ['todo', 'doing', 'done'];

const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function uploadReport(clientId, name, bytes) {
  const path = `reports/${clientId}/${name}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: Buffer.from(bytes),
  });
  if (!res.ok) { console.error('report upload failed', res.status, await res.text().catch(() => '')); return null; }
  return `${BUCKET}/${path}`;
}

async function signedUrlFor(fileUrl, expiresIn = 7 * 24 * 3600) {
  const i = fileUrl.indexOf('/');
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${fileUrl.slice(0, i)}/${fileUrl.slice(i + 1)}`, {
    method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

// Shape flat rows into phases with their steps, both in position order.
function toTree(items) {
  const phases = items.filter(i => !i.parent_id).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const byParent = new Map();
  items.filter(i => i.parent_id).forEach(i => {
    if (!byParent.has(i.parent_id)) byParent.set(i.parent_id, []);
    byParent.get(i.parent_id).push(i);
  });
  return phases.map(p => ({
    ...p,
    steps: (byParent.get(p.id) || []).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
  }));
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { action, id } = req.query;
  const projectId = req.query.project_id || req.body?.project_id;

  try {
    // Every path except id-addressed ones needs a real project.
    let project = null;
    if (projectId) {
      if (!UUID_RE.test(projectId)) return res.status(400).json({ error: 'Bad project id' });
      const rows = await supaFetch(`crm_projects?id=eq.${projectId}&select=id,name,client_id,project_kind,stage,client:crm_clients(id,business_name,owner_name)`);
      project = rows && rows[0];
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }

    // ── GET: the whole board ────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (!project) return res.status(400).json({ error: 'project_id required' });
      const items = await supaFetch(`crm_project_items?project_id=eq.${projectId}&select=*`) || [];
      const comments = await supaFetch(`crm_project_comments?project_id=eq.${projectId}&order=created_at.desc&limit=200`) || [];
      const steps = items.filter(i => i.parent_id);
      const doneCount = steps.filter(s => s.status === 'done').length;
      return res.json({
        project,
        phases: toTree(items),
        comments,
        progress: { total: steps.length, done: doneCount, pct: steps.length ? Math.round((doneCount / steps.length) * 100) : 0 },
      });
    }

    if (req.method === 'POST' && action === 'seed-template') {
      if (!project) return res.status(400).json({ error: 'project_id required' });
      const existing = await supaFetch(`crm_project_items?project_id=eq.${projectId}&select=id&limit=1`);
      if (existing && existing.length) return res.json({ ok: true, already: true });

      const tpl = templateRows(req.body?.kind || project.project_kind);
      const now = new Date().toISOString();
      const phaseIds = {};
      const phaseRows = tpl.phases.map(p => {
        const rid = crypto.randomUUID();
        phaseIds[p.key] = rid;
        return { id: rid, project_id: projectId, name: p.name, position: p.position, status: 'todo', client_visible: true, created_at: now };
      });
      await supaFetch('crm_project_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(phaseRows) });
      const stepRows = tpl.steps.map(s => ({
        project_id: projectId, parent_id: phaseIds[s.parent_key], name: s.name,
        position: s.position, status: 'todo', client_visible: s.client_visible, created_at: now,
      }));
      if (stepRows.length) await supaFetch('crm_project_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(stepRows) });

      const items = await supaFetch(`crm_project_items?project_id=eq.${projectId}&select=*`) || [];
      return res.status(201).json({ ok: true, template: tpl.label, phases: toTree(items) });
    }

    if (req.method === 'POST' && action === 'item') {
      if (!project) return res.status(400).json({ error: 'project_id required' });
      const b = req.body || {};
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ error: 'A name is required.' });
      if (b.parent_id && !UUID_RE.test(b.parent_id)) return res.status(400).json({ error: 'Bad phase id' });

      // Append to the end of its list.
      const siblings = await supaFetch(
        `crm_project_items?project_id=eq.${projectId}&parent_id=${b.parent_id ? 'eq.' + b.parent_id : 'is.null'}&select=position&order=position.desc&limit=1`
      ) || [];
      const position = siblings.length ? (siblings[0].position || 0) + 1 : 0;

      const [created] = await supaFetch('crm_project_items', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          project_id: projectId, parent_id: b.parent_id || null, name, position,
          status: 'todo', notes: b.notes || null,
          assigned_to: b.assigned_to || null, due_date: b.due_date || null,
          client_visible: b.client_visible !== false,
        }),
      });
      return res.status(201).json(created);
    }

    if (req.method === 'PATCH' && id) {
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Bad id' });
      const [item] = await supaFetch(`crm_project_items?id=eq.${id}&select=*`);
      if (!item) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };

      if (b.name != null) { const n = String(b.name).trim(); if (!n) return res.status(400).json({ error: 'Name cannot be empty.' }); patch.name = n; }
      if (b.notes != null) patch.notes = b.notes;
      if (b.assigned_to !== undefined) patch.assigned_to = b.assigned_to || null;
      if (b.due_date !== undefined) patch.due_date = b.due_date || null;
      if (b.position != null) patch.position = parseInt(b.position, 10) || 0;
      if (b.client_visible != null) patch.client_visible = !!b.client_visible;
      if (b.status != null) {
        if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status' });
        patch.status = b.status;
        // completed_at is what the report groups by, so it has to track status.
        patch.completed_at = b.status === 'done' ? (item.completed_at || new Date().toISOString()) : null;
      }

      const [updated] = await supaFetch(`crm_project_items?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return res.json(updated);
    }

    if (req.method === 'DELETE' && id) {
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Bad id' });
      const [item] = await supaFetch(`crm_project_items?id=eq.${id}&select=id,parent_id`);
      if (!item) return res.json({ ok: true });
      // Deleting a phase takes its steps and their comments with it.
      if (!item.parent_id) {
        const kids = await supaFetch(`crm_project_items?parent_id=eq.${id}&select=id`) || [];
        if (kids.length) {
          const inList = kids.map(k => `"${k.id}"`).join(',');
          await supaFetch(`crm_project_comments?item_id=in.(${inList})`, { method: 'DELETE' }).catch(() => {});
          await supaFetch(`crm_project_items?parent_id=eq.${id}`, { method: 'DELETE' });
        }
      }
      await supaFetch(`crm_project_comments?item_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await supaFetch(`crm_project_items?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && action === 'comment') {
      if (!project) return res.status(400).json({ error: 'project_id required' });
      const b = req.body || {};
      const body = String(b.body || '').trim();
      if (!body) return res.status(400).json({ error: 'Write something first.' });
      if (b.item_id && !UUID_RE.test(b.item_id)) return res.status(400).json({ error: 'Bad step id' });
      const [created] = await supaFetch('crm_project_comments', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          project_id: projectId, item_id: b.item_id || null, body,
          author: user.email || 'Team', author_kind: 'team',
          // Defaults to internal. A comment only reaches a client when it is
          // explicitly shared, never by forgetting a flag.
          internal: b.internal !== false,
        }),
      });
      return res.status(201).json(created);
    }

    // ── Report ──────────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'report') {
      if (!project) return res.status(400).json({ error: 'project_id required' });
      const b = req.body || {};
      const clientFacing = b.client_facing === true;
      const r = resolveRange(b.range, b.from, b.to);

      const items = await supaFetch(`crm_project_items?project_id=eq.${projectId}&select=*`) || [];
      const tree = toTree(items);

      // Completed steps are scoped to the window; in-progress and upcoming are
      // current state, because "what is next" is not a historical question.
      const inWindow = (ts) => ts && ts >= r.from && ts < r.toExclusive;
      const phases = tree.map(p => ({
        ...p,
        steps: p.steps.filter(s => s.status !== 'done' || inWindow((s.completed_at || '').slice(0, 10))),
      })).filter(p => p.steps.length);

      let comments = await supaFetch(
        `crm_project_comments?project_id=eq.${projectId}&created_at=gte.${r.from}&created_at=lt.${r.toExclusive}&order=created_at.asc&limit=200`
      ) || [];
      if (clientFacing) comments = comments.filter(c => c.internal !== true);

      const bytes = await buildProjectReportPdf({
        clientName: project.client?.business_name || '',
        projectName: project.name || '',
        periodLabel: r.label,
        phases, comments, clientFacing,
      });

      const safe = (project.name || 'project').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40);
      const fileName = `${safe}-${r.from}-to-${r.to}${clientFacing ? '' : '-internal'}.pdf`;
      const fileUrl = project.client_id ? await uploadReport(project.client_id, fileName, bytes) : null;
      const link = fileUrl ? await signedUrlFor(fileUrl) : null;

      // File it on the client's timeline the same way delivery-board.js does.
      if (fileUrl && project.client_id) {
        await supaFetch('crm_client_activity', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            client_id: project.client_id, type: 'note', tag: 'Report',
            title: `${clientFacing ? 'Client' : 'Internal'} progress report, ${r.label}`,
            body: `${project.name}: ${r.label}.`,
            attachment_url: link, attachment_name: fileName,
            author: user.email || 'System',
          }),
        }).catch(e => console.error('report filing failed:', e.message));
      }

      return res.json({ ok: true, url: link, file_name: fileName, range: r, client_facing: clientFacing });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('project-board error:', err);
    return res.status(500).json({ error: err.message });
  }
};
