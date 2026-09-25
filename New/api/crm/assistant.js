const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');
const { findAvailability } = require('./availability.js');

// The CRM assistant: Claude with real tools over the CRM data. Runs the
// tool-use loop server-side and returns a plain-text answer. Phase 1 tools are
// read-only (availability, follow-ups, people search, agenda). It runs for the
// signed-in user; nothing here writes or sends.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ASSISTANT_MODEL || 'claude-sonnet-5';
const FALLBACK_MODEL = 'claude-sonnet-4-5';

async function callClaude(model, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ ...body, model }),
  });
  if (r.ok) return { ok: true, data: await r.json() };
  return { ok: false, errText: await r.text() };
}

const stripDashes = (t) => (t ? String(t).replace(/[–—]/g, '-') : t);
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const TOOLS = [
  {
    name: 'find_availability',
    description: 'Find open meeting slots within the team work hours minus what is already booked on the calendar. Use this for any question about when a meeting or in-person meetup can happen.',
    input_schema: {
      type: 'object',
      properties: {
        duration_minutes: { type: 'integer', description: 'Meeting length in minutes. Default 60.' },
        days_ahead: { type: 'integer', description: 'How many days from today to search. Default 7.' },
      },
    },
  },
  {
    name: 'leads_needing_followup',
    description: 'List leads that need a follow-up: marked "needs follow-up", or past their follow-up due date and not yet handled.',
    input_schema: { type: 'object', properties: { limit: { type: 'integer' } } },
  },
  {
    name: 'search_people',
    description: 'Search leads, clients, and contacts by name.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'todays_agenda',
    description: 'Meetings coming up in the next 24 hours.',
    input_schema: { type: 'object', properties: {} },
  },
];

async function execTool(name, input) {
  if (name === 'find_availability') {
    const durationMin = Math.min(480, Math.max(15, parseInt(input.duration_minutes, 10) || 60));
    const days = Math.min(21, Math.max(1, parseInt(input.days_ahead, 10) || 7));
    const { slots, tz } = await findAvailability({ durationMin, days, limit: 14 });
    return { tz, count: slots.length, open_slots: slots.map(s => s.label) };
  }

  if (name === 'leads_needing_followup') {
    const limit = Math.min(50, Math.max(1, parseInt(input.limit, 10) || 15));
    const rows = await supaFetch(
      'crm_clients?stage=eq.lead&or=(record_type.is.null,record_type.eq.client)&select=business_name,owner_name,follow_up_status,follow_up_due_date,lead_temperature,last_contact_at&limit=400'
    ) || [];
    const today = new Date().toISOString().slice(0, 10);
    const need = rows.filter(r => {
      const st = r.follow_up_status || '';
      if (st === 'needs_follow_up') return true;
      if (st === 'done' || st === 'scheduled' || st === 'contract_sent') return false;
      return r.follow_up_due_date && String(r.follow_up_due_date).slice(0, 10) <= today;
    }).slice(0, limit);
    return {
      count: need.length,
      leads: need.map(r => ({ name: r.business_name || r.owner_name || 'Unknown', temperature: r.lead_temperature, status: r.follow_up_status || 'none', due: r.follow_up_due_date || null })),
    };
  }

  if (name === 'search_people') {
    const term = String(input.query || '').replace(/[(),*]/g, ' ').trim();
    if (!term) return { results: [] };
    const enc = encodeURIComponent(term);
    const [clients, contacts] = await Promise.all([
      supaFetch(`crm_clients?or=(business_name.ilike.*${enc}*,owner_name.ilike.*${enc}*)&select=business_name,owner_name,stage,contact_phone,contact_email&limit=10`).catch(() => []),
      supaFetch(`crm_contacts?name=ilike.*${enc}*&select=name,email,phone,company&limit=10`).catch(() => []),
    ]);
    return {
      results: [
        ...(clients || []).map(c => ({ name: c.business_name || c.owner_name, kind: c.stage === 'lead' ? 'lead' : 'client', phone: c.contact_phone || null, email: c.contact_email || null })),
        ...(contacts || []).map(c => ({ name: c.name, kind: 'contact', phone: c.phone || null, email: c.email || null, company: c.company || null })),
      ],
    };
  }

  if (name === 'todays_agenda') {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60000);
    const rows = await supaFetch(
      `crm_meetings?start_time=gte.${encodeURIComponent(now.toISOString())}&start_time=lte.${encodeURIComponent(end.toISOString())}&order=start_time.asc&select=title,start_time,location,status`
    ).catch(() => []);
    const active = (rows || []).filter(m => String(m.status || '') !== 'cancelled');
    return {
      count: active.length,
      meetings: active.map(m => ({
        title: m.title || 'Meeting',
        when: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(m.start_time)),
        location: m.location || '',
      })),
    };
  }

  return { error: 'unknown tool' };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Assistant is not configured.' });

  try {
    const { prompt, conversation } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });
    if (prompt.length > 8000) return res.status(400).json({ error: 'Prompt too long' });

    const nowCentral = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
    const system = `You are the assistant inside the Vernon Tech & Media CRM, helping ${user.email}.
Right now it is ${nowCentral} (America/Chicago). Resolve relative dates like "next week" from this.

You help the team run the CRM: check scheduling availability for meetings and meetups, find leads that need follow-up, look up people, and see what is on the calendar. Always use the tools to get real data. Never invent availability, names, phone numbers, or dates. When you give open times, list them clearly by day and time and offer a few options. Be concise and practical, a few sentences or a short list.

Never use em dashes or en dashes. Use commas, periods, or plain hyphens.`;

    const messages = [];
    if (Array.isArray(conversation)) {
      for (const m of conversation.slice(-10)) {
        if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
          messages.push({ role: m.role, content: m.content });
        }
      }
    }
    messages.push({ role: 'user', content: prompt });

    let finalText = '';
    let model = MODEL;
    for (let i = 0; i < 6; i++) {
      const body = { max_tokens: 1500, system, tools: TOOLS, messages };
      let resp = await callClaude(model, body);
      // If the newest model id is not available on this account, drop to the
      // known-good one and stay there for the rest of the loop.
      if (!resp.ok && model !== FALLBACK_MODEL && /model/i.test(resp.errText || '')) {
        model = FALLBACK_MODEL;
        resp = await callClaude(model, body);
      }
      if (!resp.ok) throw new Error('AI error: ' + (resp.errText || '').slice(0, 300));
      const data = resp.data;
      const blocks = data.content || [];
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (text) finalText = text;

      if (data.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: blocks });
        const results = [];
        for (const b of blocks) {
          if (b.type === 'tool_use') {
            let out;
            try { out = await execTool(b.name, b.input || {}); }
            catch (e) { out = { error: e.message }; }
            results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out).slice(0, 8000) });
          }
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      break;
    }

    return res.json({ answer: stripDashes(finalText) || 'Sorry, I could not answer that.' });
  } catch (e) {
    console.error('assistant error:', e);
    return res.status(500).json({ error: e.message || 'Assistant failed' });
  }
};
