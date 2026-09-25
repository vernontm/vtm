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

// Actions mode: the assistant reads a conversation and hands back concrete
// next steps as data (never prose), which the app shows as one-tap cards. The
// app does the writing (book the meeting, send the text) after the person
// taps, so this stays read-only.
const PROPOSE_TOOL = {
  name: 'propose_actions',
  description: 'Hand back the concrete next actions this conversation calls for. Call this exactly once, as your last step, with an empty list when nothing is actionable yet.',
  input_schema: {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['create_meeting', 'text_client'] },
            client_name: { type: 'string', description: 'text_client: the customer to text, as named in the CRM' },
            phone: { type: 'string', description: 'text_client: their phone from search_people, empty if not on file' },
            message: { type: 'string', description: 'The text to send. text_client: the full message in our voice, no placeholders. create_meeting: the confirmation, with {when} and {link} placeholders.' },
            title: { type: 'string', description: 'create_meeting: calendar title, e.g. "Marketing services call with Marcus Bell"' },
            service: { type: 'string', description: 'What the meeting is about, in a few words, e.g. "marketing services" or "the website redesign"' },
            start: { type: 'string', description: 'Start in ISO 8601 with the America/Chicago offset, e.g. 2026-09-28T14:30:00-05:00' },
            duration_minutes: { type: 'integer', description: '30 for a call unless they asked for longer; 60 for an in-person meetup' },
            kind: { type: 'string', enum: ['online', 'in_person'] },
            location: { type: 'string', description: 'Address for an in-person meeting, otherwise empty' },
            summary: { type: 'string', description: 'One short line for the person tapping: what will happen' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: { type: 'string', description: 'Which message made this actionable' },
          },
          required: ['type', 'summary', 'message', 'confidence'],
        },
      },
    },
    required: ['actions'],
  },
};

const CENTRAL = 'America/Chicago';
const fmtCentral = (d) => new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
// "2026-09-28T14:30:00" with no offset means Central; find the offset that
// makes the wall-clock time in Chicago match and rebuild the instant.
function parseStart(s) {
  const str = String(s || '').trim();
  if (!str) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(str)) { const d = new Date(str); return isNaN(d) ? null : d; }
  const guess = new Date(str + 'Z');
  if (isNaN(guess)) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess);
  const get = (t) => parts.find(p => p.type === t)?.value;
  const asIfCentral = Date.UTC(+get('year'), +get('month') - 1, +get('day'), +get('hour'), +get('minute'));
  const offsetMs = asIfCentral - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}
function normalizeActions(list) {
  const out = [];
  for (const a of (Array.isArray(list) ? list : [])) {
    if (!a) continue;
    if (a.type === 'text_client') {
      const message = stripDashes(String(a.message || '').trim().slice(0, 800));
      if (!message) continue;
      out.push({
        type: 'text_client',
        client_name: stripDashes(String(a.client_name || '').slice(0, 120)),
        phone: last10(a.phone) ? `+1${last10(a.phone)}` : '',
        message,
        summary: stripDashes(String(a.summary || '').slice(0, 200)),
        confidence: ['high', 'medium', 'low'].includes(a.confidence) ? a.confidence : 'medium',
        reason: stripDashes(String(a.reason || '').slice(0, 200)),
      });
      continue;
    }
    if (a.type !== 'create_meeting') continue;
    const start = parseStart(a.start);
    if (!start || start.getTime() < Date.now() - 5 * 60000) continue;
    const duration = Math.min(240, Math.max(15, parseInt(a.duration_minutes, 10) || 30));
    const end = new Date(start.getTime() + duration * 60000);
    out.push({
      type: 'create_meeting',
      title: stripDashes(String(a.title || 'Call').slice(0, 120)),
      service: stripDashes(String(a.service || '').slice(0, 80)),
      start: start.toISOString(),
      end: end.toISOString(),
      when: fmtCentral(start),
      duration_minutes: duration,
      kind: a.kind === 'in_person' ? 'in_person' : 'online',
      location: stripDashes(String(a.location || '').slice(0, 200)),
      summary: stripDashes(String(a.summary || '').slice(0, 200)),
      message: stripDashes(String(a.message || 'You are booked for {when}. {link}').slice(0, 600)),
      confidence: ['high', 'medium', 'low'].includes(a.confidence) ? a.confidence : 'medium',
      reason: stripDashes(String(a.reason || '').slice(0, 200)),
    });
  }
  return out.slice(0, 3);
}

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
    const { prompt, conversation, mode } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt required' });
    if (prompt.length > 12000) return res.status(400).json({ error: 'Prompt too long' });
    const actionsMode = mode === 'actions';

    const nowCentral = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
    const system = actionsMode
      ? `You read one customer conversation for the Vernon Tech & Media team (signed in: ${user.email}) and decide what concrete action it calls for right now.
Right now it is ${nowCentral} (America/Chicago). Resolve every relative date and time from this, in America/Chicago, and write starts as ISO 8601 with the Chicago offset.

Two kinds of action exist.
create_meeting: only when a customer has agreed to a specific day and time in their own thread (for example "2:30 works for me" after we offered Monday 2:30 PM), or clearly asked to book one specific slot. The time must be inside the team's work hours; call find_availability to confirm the slot is open when you are not sure. A call is 30 minutes online (Google Meet) unless they asked to meet in person or for longer. The title names the service and the person, like "Marketing services call with Marcus Bell". The message is what we text them after booking: warm, one to three sentences, with {when} and {link} placeholders, no sign-off.
text_client: when the conversation is an internal team chat and the team has decided (or clearly needs) to reach a customer: reschedule, confirm, follow up, answer a question, send a reminder. Use search_people to find the customer and their phone; if no phone is on file still propose it with the phone empty. Write the full text in our voice, warm and specific, one to three sentences, no placeholders, no sign-off. One text_client per customer.
If the thread is still ambiguous, or nothing needs doing yet, hand back an empty list. Never invent names, prices or dates. Always finish by calling propose_actions exactly once.

Never use em dashes or en dashes. Use commas, periods, or plain hyphens.`
      : `You are the assistant inside the Vernon Tech & Media CRM, helping ${user.email}.
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
    let proposed = null;
    let model = MODEL;
    const tools = actionsMode ? [...TOOLS, PROPOSE_TOOL] : TOOLS;
    for (let i = 0; i < 6; i++) {
      const body = { max_tokens: 1500, system, tools, messages };
      if (actionsMode) body.tool_choice = { type: 'any' };
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
        // In actions mode the final tool call IS the answer.
        const handoff = blocks.find(b => b.type === 'tool_use' && b.name === 'propose_actions');
        if (handoff) { proposed = handoff.input?.actions || []; break; }
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

    if (actionsMode) return res.json({ actions: normalizeActions(proposed) });
    return res.json({ answer: stripDashes(finalText) || 'Sorry, I could not answer that.' });
  } catch (e) {
    console.error('assistant error:', e);
    return res.status(500).json({ error: e.message || 'Assistant failed' });
  }
};
