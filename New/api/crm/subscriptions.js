import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    // ── GET: list subscriptions ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const { status } = req.query;
      let path = 'crm_subscriptions?select=*&order=next_renewal.asc.nullslast';
      if (status) path += `&status=eq.${encodeURIComponent(status)}`;
      const rows = await supaFetch(path);
      return res.status(200).json(rows);
    }

    // ── POST with action=scan: scan Gmail for subscription emails ─────────────
    if (req.method === 'POST' && action === 'scan') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: 'ANTHROPIC_API_KEY is not configured. Add it to your environment variables to enable Gmail subscription scanning.',
        });
      }

      const { accessToken } = await getGmailAuth();

      // Search Gmail for subscription-related emails from the last 90 days
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const afterDate = ninetyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
      const keywords = '(subscription OR renewal OR billing OR receipt OR "your plan" OR "payment confirmed")';
      const query = `${keywords} after:${afterDate}`;

      const searchParams = new URLSearchParams({
        q: query,
        maxResults: '20',
      });

      const searchRes = await fetch(`${GMAIL_API}/messages?${searchParams}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!searchRes.ok) {
        const err = await searchRes.text();
        throw new Error(`Gmail search failed: ${err}`);
      }
      const searchData = await searchRes.json();
      const messageIds = (searchData.messages || []).map(m => m.id);

      if (messageIds.length === 0) {
        return res.status(200).json({ subscriptions: [], message: 'No subscription-related emails found in the last 90 days.' });
      }

      // Fetch full body of each message
      const emails = [];
      for (const msgId of messageIds) {
        try {
          const msgRes = await fetch(`${GMAIL_API}/messages/${msgId}?format=full`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!msgRes.ok) continue;
          const msg = await msgRes.json();

          const headers = msg.payload?.headers || [];
          const getHeader = (name) =>
            (headers.find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

          // Extract plain text body
          let body = '';
          const extractText = (part) => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
            }
            if (part.parts) part.parts.forEach(extractText);
          };
          extractText(msg.payload);

          // Fall back to snippet if no plain text body
          if (!body) body = msg.snippet || '';

          // Truncate to avoid token overload
          if (body.length > 3000) body = body.slice(0, 3000);

          emails.push({
            id: msgId,
            from: getHeader('From'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            body,
          });
        } catch {
          // Skip individual message errors
        }
      }

      if (emails.length === 0) {
        return res.status(200).json({ subscriptions: [], message: 'Found emails but could not read their contents.' });
      }

      // Send to Claude for extraction
      const emailSummaries = emails
        .map((e, i) => `--- Email ${i + 1} (gmail_id: ${e.id}) ---\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n\n${e.body}`)
        .join('\n\n');

      const claudeRes = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `You are a subscription data extractor. Analyze these emails and extract any recurring subscriptions or services being billed.

For each subscription found, return a JSON array of objects with these fields:
- service: string (company/service name, clean and normalized)
- amount: number or null (dollar amount per billing cycle)
- billing_cycle: string or null ("monthly", "yearly", "quarterly", etc.)
- next_renewal: string or null (ISO date of next expected renewal, estimate from email date + billing cycle if not explicit)
- gmail_message_id: string (the gmail_id from the email it was found in)
- category: string or null (one of: "software", "hosting", "marketing", "productivity", "communication", "storage", "security", "entertainment", "finance", "other")

Rules:
- Deduplicate by service name (keep the most recent/complete info)
- Only include actual recurring subscriptions, not one-time purchases
- If amount is mentioned in a different currency, convert approximate USD
- Return ONLY the JSON array, no other text

Emails:
${emailSummaries}`,
            },
          ],
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        throw new Error(`Claude API error: ${err}`);
      }

      const claudeData = await claudeRes.json();
      const responseText = (claudeData.content || []).find(c => c.type === 'text')?.text || '[]';

      // Parse the JSON from Claude's response
      let subscriptions = [];
      try {
        // Handle case where Claude wraps in markdown code block
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          subscriptions = JSON.parse(jsonMatch[0]);
        }
      } catch {
        return res.status(200).json({
          subscriptions: [],
          message: 'Could not parse subscription data from emails. Try again or add subscriptions manually.',
          raw: responseText,
        });
      }

      // Deduplicate by normalized service name
      const seen = new Map();
      for (const sub of subscriptions) {
        const key = (sub.service || '').toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.set(key, sub);
        }
      }

      return res.status(200).json({
        subscriptions: Array.from(seen.values()),
        emailsScanned: emails.length,
      });
    }

    // ── POST: create subscription manually ────────────────────────────────────
    if (req.method === 'POST') {
      const { service, amount, billing_cycle, next_renewal, gmail_message_id, status, category, notes } = req.body;
      if (!service) return res.status(400).json({ error: 'service is required' });

      const row = {
        service,
        amount: amount || null,
        billing_cycle: billing_cycle || null,
        next_renewal: next_renewal || null,
        gmail_message_id: gmail_message_id || null,
        status: status || 'active',
        category: category || null,
        notes: notes || null,
      };

      const created = await supaFetch('crm_subscriptions', {
        method: 'POST',
        body: JSON.stringify(row),
      });
      return res.status(201).json(created);
    }

    // ── PUT: update subscription ──────────────────────────────────────────────
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id query param required' });

      const updates = { ...req.body, updated_at: new Date().toISOString() };
      delete updates.id;
      delete updates.created_at;

      const updated = await supaFetch(`crm_subscriptions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return res.status(200).json(updated);
    }

    // ── DELETE: remove subscription ───────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id query param required' });

      await supaFetch(`crm_subscriptions?id=eq.${id}`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Subscriptions API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
