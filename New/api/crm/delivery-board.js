// ─────────────────────────────────────────────────────────────────────────────
// Delivery board — the Trello-style view of every client in delivery.
//
//   GET    ?action=board            → columns of client cards with checklist
//                                     progress, monthly content counts vs quota,
//                                     and last-report age
//   PATCH  ?action=move&id=         → { delivery_stage } move a card; seeds that
//                                     stage's checklist (idempotent) + logs it
//   POST   ?action=quota&id=        → { posts, reels } set the monthly quota
//   POST   ?action=progress&id=     → { kind: 'posts'|'reels', delta } manual
//                                     +1/-1 for clients without upload-post
//   POST   ?action=report&id=       → build this month's social report from
//                                     upload-post, save it as a client Document
// ─────────────────────────────────────────────────────────────────────────────
import { setCors, requireCrmUser, supaFetch, loadUserAccess } from '../_lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UP_BASE = 'https://api.upload-post.com/api';
const UP_KEY = process.env.UPLOADPOST_API_KEY;

// The delivery pipeline. Order matters — it is the column order on the board.
export const DELIVERY_STAGES = [
  { key: 'onboarding',     label: 'Onboarding & Access' },
  { key: 'website',        label: 'Website Build' },
  { key: 'seo',            label: 'SEO Setup' },
  { key: 'content_launch', label: 'Content Launch' },
  { key: 'ongoing',        label: 'Monthly Engine' },
  { key: 'paused',         label: 'Paused' },
];

// Checklist templates seeded into crm_client_tasks when a card enters a stage.
// category = `delivery:<stage>` so they never collide with the portal's
// client-facing "access" tasks.
const STAGE_CHECKLISTS = {
  onboarding: [
    'Kickoff call scheduled',
    'TikTok login received',
    'Instagram login received',
    'Facebook page access',
    'Google Business access',
    'Website hosting login',
    'Domain registrar login',
    'Brand assets received (logo, menu, photos)',
  ],
  website: [
    'Sitemap / pages agreed',
    'Design draft sent',
    'Photos + copy collected',
    'Site built',
    'Client review + revisions',
    'Launched (DNS live)',
  ],
  seo: [
    'Google Business optimized',
    'Keywords picked',
    'On-page SEO done',
    'Weekly Google posts automated',
    'Review QR codes placed',
  ],
  content_launch: [
    'First shoot scheduled',
    'First batch edited',
    'Captions approved',
    'First batch posted',
    'Posting schedule automated',
  ],
  ongoing: [],
  paused: [],
};

async function upFetch(path) {
  // 8s cap per call: a hung upload-post request must never stall the board.
  const r = await fetch(`${UP_BASE}${path}`, {
    headers: { Authorization: `Apikey ${UP_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) throw new Error(body?.error || body?.message || `upload-post ${r.status}`);
  return body;
}

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Count this month's published pieces for an upload-post profile via the
// history endpoint (newest-first, max limit 100, page param supported). One
// piece fans out to several platforms (one row each), so dedupe by request_id.
// Paginate until we pass the month boundary so a busy profile (100+ rows/mo)
// is never undercounted. Videos count as reels; photos/carousels as posts.
async function monthCounts(user) {
  const mk = monthKey();
  const seen = new Map();   // request_id -> media_type
  for (let page = 1; page <= 10; page++) {   // safety cap: 1000 rows
    const data = await upFetch(`/uploadposts/history?profile=${encodeURIComponent(user)}&limit=100&page=${page}`);
    const list = data.history || data.data || (Array.isArray(data) ? data : []);
    if (!list.length) break;
    let pastMonth = false;
    for (const p of list) {
      const ts = String(p.upload_timestamp || '');
      if (ts && ts.slice(0, 7) < mk) pastMonth = true;
      if (!p.success || !ts.startsWith(mk)) continue;
      const id = p.request_id || p.job_id || ts;
      if (!seen.has(id)) seen.set(id, (p.media_type || '').toLowerCase());
    }
    if (pastMonth || list.length < 100) break;
  }
  let posts = 0, reels = 0;
  for (const type of seen.values()) { if (type.includes('video')) reels++; else posts++; }
  return { posts, reels };
}

async function seedChecklist(clientId, stage) {
  const items = STAGE_CHECKLISTS[stage] || [];
  if (!items.length) return;
  const category = `delivery:${stage}`;
  const existing = await supaFetch(`crm_client_tasks?client_id=eq.${clientId}&category=eq.${encodeURIComponent(category)}&select=id&limit=1`);
  if (existing && existing.length) return;   // already seeded
  // Concurrent board loads can race past the check above; the partial unique
  // index (client_id, category, title) + ignore-duplicates makes that harmless.
  // No on_conflict target: PostgREST then emits a bare ON CONFLICT DO NOTHING,
  // which is the only form that can use our PARTIAL unique index.
  await supaFetch('crm_client_tasks', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(items.map(title => ({
      client_id: clientId, category, title, status: 'todo', assigned_to: 'VTM',
    }))),
  });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  // A valid Supabase JWT is not enough (portal clients and academy students
  // also hold them): require CRM access — admin, or at least one client grant.
  if (!user.is_admin) {
    const access = await loadUserAccess(user.id, false, user.allowed_pages_global).catch(() => null);
    if (!access || !(access.clients || []).length) return res.status(403).json({ error: 'Forbidden' });
  }

  const { action, id } = req.query;
  if (id && !UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // ── The board ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && (action === 'board' || !action)) {
      const clients = await supaFetch(
        `crm_clients?stage=neq.lead&select=id,business_name,owner_name,stage,delivery_stage,delivery_stage_since,potential_value,potential_value_type,payment_received,content_quota,content_progress,upload_post_user,retainer_status&order=delivery_stage_since.asc`
      ) || [];
      const ids = clients.map(c => c.id);
      let tasks = ids.length ? await supaFetch(
        `crm_client_tasks?client_id=in.(${ids.join(',')})&category=like.delivery:*&select=id,client_id,category,status,title&order=created_at.asc`
      ) || [] : [];

      // Lazy-seed: cards backfilled straight into a stage (not dragged there)
      // have no checklist yet — seed it on first board load.
      const needSeed = clients.filter(c => {
        const stage = c.delivery_stage || 'onboarding';
        return (STAGE_CHECKLISTS[stage] || []).length &&
          !tasks.some(t => t.client_id === c.id && t.category === `delivery:${stage}`);
      });
      if (needSeed.length) {
        await Promise.all(needSeed.map(c => seedChecklist(c.id, c.delivery_stage || 'onboarding').catch(() => {})));
        tasks = await supaFetch(
          `crm_client_tasks?client_id=in.(${ids.join(',')})&category=like.delivery:*&select=id,client_id,category,status,title&order=created_at.asc`
        ) || [];
      }
      const reports = ids.length ? await supaFetch(
        `crm_client_activity?client_id=in.(${ids.join(',')})&tag=eq.Report&select=client_id,created_at&order=created_at.desc`
      ) || [] : [];

      const mk = monthKey();
      const cards = clients.map(c => {
        const stage = c.delivery_stage || 'onboarding';
        const mine = tasks.filter(t => t.client_id === c.id && t.category === `delivery:${stage}`);
        const lastReport = reports.find(r => r.client_id === c.id)?.created_at || null;
        const manual = (c.content_progress || {})[mk] || {};
        return {
          id: c.id,
          name: c.business_name || c.owner_name,
          stage,
          since: c.delivery_stage_since,
          monthly: c.potential_value_type === 'monthly' ? Number(c.potential_value) || 0 : 0,
          value: Number(c.potential_value) || 0,
          paid: !!c.payment_received,
          checklist: {
            done: mine.filter(t => t.status === 'done').length,
            total: mine.length,
            items: mine.map(t => ({ id: t.id, title: t.title, done: t.status === 'done' })),
          },
          quota: c.content_quota || null,
          progress: { posts: manual.posts || 0, reels: manual.reels || 0, source: 'manual' },
          upload_post_user: c.upload_post_user || null,
          last_report_at: lastReport,
          report_due: stage === 'ongoing' && (!lastReport || !String(lastReport).startsWith(mk)),
        };
      });

      // Live content counts from upload-post, best-effort and in parallel.
      await Promise.all(cards.map(async card => {
        if (!card.upload_post_user || !UP_KEY) return;
        try {
          const counts = await monthCounts(card.upload_post_user);
          card.progress = { ...counts, source: 'upload-post' };
        } catch { /* keep manual counts */ }
      }));

      return res.json({ stages: DELIVERY_STAGES, cards });
    }

    // ── Move a card ───────────────────────────────────────────────────────
    if (req.method === 'PATCH' && action === 'move' && id) {
      const { delivery_stage } = req.body || {};
      if (!DELIVERY_STAGES.some(s => s.key === delivery_stage)) {
        return res.status(400).json({ error: `delivery_stage must be one of: ${DELIVERY_STAGES.map(s => s.key).join(', ')}` });
      }
      // No-op guard: dropping a card back onto its own column must not reset
      // the days-in-stage clock or log a fake "Moved to" activity.
      const [cur] = await supaFetch(`crm_clients?id=eq.${id}&select=delivery_stage`) || [];
      if (!cur) return res.status(404).json({ error: 'Client not found' });
      if (cur.delivery_stage === delivery_stage) return res.json({ ok: true, delivery_stage, unchanged: true });
      await supaFetch(`crm_clients?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ delivery_stage, delivery_stage_since: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
      await seedChecklist(id, delivery_stage);
      const label = DELIVERY_STAGES.find(s => s.key === delivery_stage)?.label || delivery_stage;
      await supaFetch('crm_client_activity', {
        method: 'POST',
        body: JSON.stringify({ client_id: id, type: 'note', tag: 'Stage', title: `Moved to ${label}`, body: `Delivery stage set to ${label}.`, author: user.email || 'CRM' }),
      }).catch(() => {});
      return res.json({ ok: true, delivery_stage });
    }

    // ── Set the monthly quota ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'quota' && id) {
      const posts = Math.max(0, parseInt(req.body?.posts, 10) || 0);
      const reels = Math.max(0, parseInt(req.body?.reels, 10) || 0);
      await supaFetch(`crm_clients?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ content_quota: { posts, reels }, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, quota: { posts, reels } });
    }

    // ── Manual content progress (+1 post / +1 reel) ───────────────────────
    if (req.method === 'POST' && action === 'progress' && id) {
      const { kind, delta } = req.body || {};
      if (!['posts', 'reels'].includes(kind)) return res.status(400).json({ error: 'kind must be posts or reels' });
      const [c] = await supaFetch(`crm_clients?id=eq.${id}&select=content_progress`) || [];
      const mk = monthKey();
      const prog = { ...(c?.content_progress || {}) };
      const cur = { posts: 0, reels: 0, ...(prog[mk] || {}) };
      cur[kind] = Math.max(0, (cur[kind] || 0) + (parseInt(delta, 10) || 1));
      prog[mk] = cur;
      await supaFetch(`crm_clients?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ content_progress: prog, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, month: mk, progress: cur });
    }

    // ── Monthly social report → saved as a client Document ────────────────
    if (req.method === 'POST' && action === 'report' && id) {
      const [c] = await supaFetch(`crm_clients?id=eq.${id}&select=id,business_name,upload_post_user,content_quota,content_progress`) || [];
      if (!c) return res.status(404).json({ error: 'Client not found' });
      const mk = monthKey();
      const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      let counts = { posts: 0, reels: 0 };
      let analytics = null;
      if (c.upload_post_user && UP_KEY) {
        try { counts = await monthCounts(c.upload_post_user); } catch { /* fall through */ }
        try {
          const a = await upFetch(`/uploadposts/analytics?profile=${encodeURIComponent(c.upload_post_user)}`);
          analytics = a?.analytics || a?.data || a;
        } catch { /* analytics optional */ }
      }
      const manual = (c.content_progress || {})[mk] || {};
      counts = { posts: Math.max(counts.posts, manual.posts || 0), reels: Math.max(counts.reels, manual.reels || 0) };
      const quota = c.content_quota || {};

      const lines = [
        `# ${c.business_name} — Social Report, ${monthName}`,
        '',
        '## Content delivered this month',
        `- Posts: ${counts.posts}${quota.posts ? ` of ${quota.posts} promised` : ''}`,
        `- Reels/videos: ${counts.reels}${quota.reels ? ` of ${quota.reels} promised` : ''}`,
      ];
      if (analytics && typeof analytics === 'object') {
        lines.push('', '## Platform analytics');
        for (const [k, v] of Object.entries(analytics).slice(0, 12)) {
          if (v == null || typeof v === 'object') continue;
          lines.push(`- ${k.replace(/_/g, ' ')}: ${v}`);
        }
      }
      lines.push('', `Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by VTM CRM.`);
      const md = lines.join('\n');

      // Store the markdown in Supabase storage + attach as a Document.
      const key = `${id}/${Date.now()}_report_${mk}.md`;
      const SUPA = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
      const SVC = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
      const up = await fetch(`${SUPA}/storage/v1/object/client-documents/${key}`, {
        method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'text/markdown', 'x-upsert': 'true' }, body: md,
      });
      const url = up.ok ? `${SUPA}/storage/v1/object/public/client-documents/${key}` : null;

      await supaFetch('crm_client_activity', {
        method: 'POST',
        body: JSON.stringify({
          client_id: id, type: 'note', tag: 'Report',
          title: `Social report — ${monthName}`,
          body: md.slice(0, 1800),
          attachment_url: url, attachment_name: `Social report ${mk}.md`,
          author: user.email || 'CRM',
        }),
      });
      return res.json({ ok: true, report: md, url });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('delivery-board error:', err);
    // Never echo raw upstream (Supabase/upload-post) error bodies to the client.
    return res.status(500).json({ error: 'Something went wrong on the board. Try again.' });
  }
}
