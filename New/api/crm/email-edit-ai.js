const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// POST /api/crm/email-edit-ai
// Body: { client_id, html, instruction, selection? }
//   selection = { refId, text, tag, outerHtml }
//
// Streams an SSE response with events:
//   event: progress — { phase, mode, chars?, model? }
//   event: done     — { html, message, mode }
//   event: error    — { error }
//
// Two operating modes:
//   - PATCH mode (fast): user clicked an element AND the instruction is
//     element-scoped. We send ONLY that element's outerHTML and ask the AI
//     for a replacement outerHTML. We splice it back into the document
//     server-side. Uses Haiku, ~2000 output tokens. Typical latency 2-5s.
//   - FULL mode: instruction implies global change (or no element selected).
//     We send the whole document and ask for the whole document back. Uses
//     Sonnet, 16000 output tokens. Typical latency 20-60s.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { client_id, html, instruction, selection } = req.body || {};
  if (!client_id) return res.status(400).json({ error: 'client_id required' });
  if (!html) return res.status(400).json({ error: 'html required' });
  if (!instruction) return res.status(400).json({ error: 'instruction required' });

  // ── Brand context (trimmed — edits don't need the full bible) ──
  let brand = {};
  try {
    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}`);
    const c = clients?.[0];
    if (c) {
      brand = {
        name: c.business_name || '',
        tone: c.preferred_tone || 'warm, confident, direct',
        primary: c.brand_primary_color || '',
        secondary: c.brand_secondary_color || '',
        bible: (c.brand_bible || '').slice(0, 1500),
      };
    }
  } catch {}

  // ── Decide mode ──
  const hasSelection = !!(selection && selection.refId && selection.outerHtml);
  const globalHints = /\b(entire|whole|all sections?|every section|remove section|delete section|add (?:a )?section|new section|layout|overall|everything|rewrite the email|theme|palette|colou?rs? throughout)\b/i;
  const patchMode = hasSelection && !globalHints.test(instruction);

  // ── Set up SSE ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };
  // Keepalive ping — prevents intermediaries from closing the socket
  const pingTimer = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
  req.on('close', () => clearInterval(pingTimer));

  try {
    const brandLine = brand.name
      ? `BRAND: ${brand.name}. Tone: ${brand.tone}.${brand.primary ? ` Primary color: ${brand.primary}.` : ''}${brand.secondary ? ` Secondary: ${brand.secondary}.` : ''}`
      : '';
    const bibleLine = brand.bible ? `BRAND GUIDE (keep copy aligned):\n${brand.bible}` : '';

    let systemPrompt, userContent, model, maxTokens;
    if (patchMode) {
      model = 'claude-haiku-4-5';
      maxTokens = 2000;
      systemPrompt = `You are an email design assistant. The user has selected ONE element in an email and wants to edit only that element.

${brandLine}
${bibleLine}

RULES:
1. Output ONLY valid JSON — no prose, no code fences. Shape:
   { "outerHtml": "<replacement HTML for the element>", "message": "<short sentence about the change>" }
2. Return exactly ONE element as the replacement. Preserve data-vtm-ref="${selection.refId}" on the returned root element unless the instruction explicitly asks to change its tag.
3. No em or en dashes. Use hyphens, commas, or periods.
4. Inline styles are fine. No <script>, no <iframe>, no external JS.
5. Do NOT return the whole email. Only the replacement for this one element.`;
      userContent = `INSTRUCTION: ${instruction}\n\nELEMENT TO REPLACE:\n${selection.outerHtml}`;
    } else {
      model = 'claude-sonnet-4-5';
      maxTokens = 16000;
      const selectionBlock = hasSelection
        ? `\n\nUSER CLICKED THIS ELEMENT (scope edit here if instruction says "this"/"it"):\n- refId: ${selection.refId}\n- tag: <${selection.tag || '?'}>\n- outerHTML: ${(selection.outerHtml || '').slice(0, 1200)}`
        : '';
      systemPrompt = `You are an AI email design assistant. Given the FULL HTML of an email and an instruction, return the UPDATED full HTML.

${brandLine}
${bibleLine}

RULES:
1. Output ONLY valid JSON — no prose, no code fences. Shape:
   { "html": "<full updated document>", "message": "<one short sentence about what you changed>" }
2. Preserve overall structure, brand feel, and data-vtm-ref attributes on elements you do not fundamentally change.
3. Removing a section means deleting the whole logical block (card/container/strip), not just its inner text.
4. New sections should match the existing visual style (classes, inline styles, color palette).
5. No em or en dashes — use hyphens, commas, or periods.
6. If you change a YouTube link, update the nested <img src="https://img.youtube.com/vi/{ID}/maxresdefault.jpg"> thumbnail too.
7. No <script>, <iframe>, or external JS. Inline styles only.${selectionBlock}`;
      userContent = `INSTRUCTION: ${instruction}\n\nCURRENT HTML:\n${html}`;
    }

    send('progress', { phase: 'start', mode: patchMode ? 'patch' : 'full', model });

    // ── Call Anthropic with streaming ──
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      // If Haiku isn't available for this account, fall back to Sonnet once
      if (patchMode && /model|not_found|invalid/i.test(errText)) {
        send('progress', { phase: 'fallback', model: 'claude-sonnet-4-5' });
        const retry = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: maxTokens,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
          }),
        });
        if (!retry.ok) {
          send('error', { error: 'AI call failed: ' + (await retry.text()).slice(0, 400) });
          clearInterval(pingTimer); return res.end();
        }
        return void await consumeAndFinish(retry, { patchMode, selection, html, send, res, pingTimer });
      }
      send('error', { error: 'AI call failed: ' + errText.slice(0, 400) });
      clearInterval(pingTimer); return res.end();
    }

    await consumeAndFinish(aiRes, { patchMode, selection, html, send, res, pingTimer });
  } catch (err) {
    console.error('email-edit-ai error:', err);
    try { send('error', { error: err.message || 'Unknown error' }); } catch {}
    clearInterval(pingTimer);
    try { res.end(); } catch {}
  }
};

// ── Consume the Anthropic SSE stream, forward progress, emit final 'done' ──
async function consumeAndFinish(aiRes, { patchMode, selection, html, send, res, pingTimer }) {
  const reader = aiRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let accum = '';
  let lastProgressAt = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const lines = raw.split('\n');
      let ev = '', dat = '';
      for (const l of lines) {
        if (l.startsWith('event: ')) ev = l.slice(7).trim();
        else if (l.startsWith('data: ')) dat += l.slice(6);
      }
      if (!dat) continue;
      try {
        const payload = JSON.parse(dat);
        if (ev === 'content_block_delta' && payload.delta?.text) {
          accum += payload.delta.text;
          const now = Date.now();
          if (now - lastProgressAt > 250) {
            lastProgressAt = now;
            send('progress', { phase: 'stream', chars: accum.length });
          }
        }
      } catch {}
    }
  }

  // ── Parse final JSON ──
  const cleaned = accum.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) { send('error', { error: 'Failed to parse AI response' }); clearInterval(pingTimer); return res.end(); }
    try { parsed = JSON.parse(m[0]); }
    catch (e) { send('error', { error: 'Parse error: ' + e.message }); clearInterval(pingTimer); return res.end(); }
  }

  const normDash = (s) => (s || '').replace(/\u2014/g, '-').replace(/\u2013/g, '-');

  if (patchMode) {
    const patchedOuter = normDash(parsed.outerHtml || '');
    if (!patchedOuter) { send('error', { error: 'AI returned empty outerHtml' }); clearInterval(pingTimer); return res.end(); }
    const newHtml = spliceByRef(html, selection.refId, patchedOuter);
    send('done', { html: newHtml, message: parsed.message || 'Updated.', mode: 'patch' });
  } else {
    const newHtml = normDash(parsed.html || '');
    if (!newHtml) { send('error', { error: 'AI returned empty html' }); clearInterval(pingTimer); return res.end(); }
    send('done', { html: newHtml, message: parsed.message || 'Updated.', mode: 'full' });
  }
  clearInterval(pingTimer);
  res.end();
}

// ── Replace the element carrying data-vtm-ref="refId" with `replacement` ──
// Honors nesting of same-tag elements. Returns original html if refId not found.
function spliceByRef(html, refId, replacement) {
  if (!refId || !replacement) return html;
  const escaped = refId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(`<([a-zA-Z0-9]+)([^>]*?)data-vtm-ref=["']${escaped}["']([^>]*)>`, 'i');
  const m = html.match(openRe);
  if (!m) return html;
  const startIdx = m.index;
  const tag = m[1].toLowerCase();
  const voidTags = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'col']);
  if (voidTags.has(tag) || m[0].endsWith('/>')) {
    return html.slice(0, startIdx) + replacement + html.slice(startIdx + m[0].length);
  }
  let depth = 1;
  let i = startIdx + m[0].length;
  const openTag = new RegExp(`<${tag}\\b`, 'gi');
  const closeTag = new RegExp(`</${tag}\\s*>`, 'gi');
  while (i < html.length && depth > 0) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;
    const oMatch = openTag.exec(html);
    const cMatch = closeTag.exec(html);
    if (!cMatch) break;
    if (oMatch && oMatch.index < cMatch.index) {
      depth += 1;
      i = oMatch.index + oMatch[0].length;
    } else {
      depth -= 1;
      i = cMatch.index + cMatch[0].length;
      if (depth === 0) {
        return html.slice(0, startIdx) + replacement + html.slice(i);
      }
    }
  }
  return html.slice(0, startIdx) + replacement + html.slice(startIdx + m[0].length);
}
