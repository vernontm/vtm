const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { client, leads } = req.body;

  if (!client || !leads || !leads.length) {
    return res.status(400).json({ error: 'client and leads array required' });
  }

  try {
    const prompt = `You are an outreach email specialist for Vernon Tech & Media. Generate personalized outreach emails for each lead.

CLIENT PROFILE:
- Business: ${client.business_name}
- Industry: ${client.industry || client.business_type}
- Services: ${client.services}
- Target Audience: ${client.target_audience}
- Unique Selling Points: ${client.unique_selling_points}
- Campaign Goals: ${client.campaign_goals}
- Preferred Tone: ${client.outreach_tone || 'friendly'}
- Location: ${client.location_city}, ${client.location_state}

LEADS TO EMAIL (generate one email per lead, using EXACTLY the name shown for each):
${leads.map((l, i) => `--- LEAD ${i} ---
NAME: ${l.name}
EMAIL: ${l.email}
NICHE: ${l.niche || 'general'}
FOLLOWERS: ${l.follower_count || 0}
CONTENT STYLE: ${l.content_style || 'unknown'}
NOTES: ${l.notes || 'none'}`).join('\n')}

RULES:
1. Write from the client's perspective (as ${client.business_name})
2. CRITICAL: The greeting and body MUST use the EXACT name from the NAME field for that lead. Do NOT mix up names between leads.
3. Reference the lead's specific content/niche
4. Clearly state the collaboration opportunity
5. Be concise (under 150 words per email)
6. Match the tone: ${client.outreach_tone || 'friendly'}
7. Include a clear call to action
8. Each email must feel personal, not templated

Return a JSON array where lead_index matches the LEAD number above:
[
  {
    "lead_index": 0,
    "name": "exact name from NAME field",
    "subject": "email subject line",
    "body": "full email body text starting with greeting using the correct name"
  }
]

Return ONLY valid JSON array, no markdown, no explanation.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse emails', raw: text });
    }

    const emails = JSON.parse(jsonMatch[0]);

    // Save to outreach queue and update leads
    const queueItems = [];
    for (const email of emails) {
      const lead = leads[email.lead_index];
      if (!lead || !lead.email) continue;

      const queueItem = {
        client_id: client.id,
        lead_id: lead.id || null,
        to_email: lead.email,
        to_name: lead.name,
        subject: email.subject,
        body: email.body,
        status: 'pending_review',
      };
      queueItems.push(queueItem);

      // Update lead with draft
      if (lead.id) {
        await supaFetch(`crm_client_leads?id=eq.${lead.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            outreach_subject: email.subject,
            outreach_draft: email.body,
            email_status: 'draft',
            updated_at: new Date().toISOString(),
          }),
        });
      }
    }

    // Bulk insert queue items
    if (queueItems.length > 0) {
      await supaFetch('crm_outreach_queue', {
        method: 'POST',
        body: JSON.stringify(queueItems),
      });
    }

    return res.json({ emails, queued: queueItems.length });

  } catch (err) {
    console.error('Generate outreach error:', err);
    return res.status(500).json({ error: err.message });
  }
};
