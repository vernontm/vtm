import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import Anthropic from '@anthropic-ai/sdk';

/** Strip em dashes (—), en dashes (–), and replace with hyphens or commas */
function stripDashes(text) {
  if (!text) return text;
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  try {
    // POST /api/crm/email-generate?action=single
    if (req.method === 'POST' && action === 'single') {
      const { lead_id, focus, extra_context } = req.body;
      if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

      const [lead] = await supaFetch(`crm_leads?id=eq.${lead_id}`);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });

      // Get settings for email context
      const settings = await supaFetch('crm_app_settings');
      const settingsMap = {};
      settings.forEach(s => { settingsMap[s.key] = s.value; });

      // Get communication history
      const commLog = await supaFetch(`crm_communication_log?lead_id=eq.${lead_id}&order=created_at.desc&limit=5`);

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemPrompt = `You are an expert email copywriter for ${settingsMap.company_name || 'Vernon Tech & Media'}.
Tone: ${settingsMap.tone_preference || 'professional'}.
Services: ${settingsMap.services_offered || 'web development, AI automation, social media'}.
Target client: ${settingsMap.target_client || 'small business owners'}.
Sender name: ${settingsMap.sender_name || 'Vernon'}.

IMPORTANT: Never use em dashes (—) or en dashes (–) in any text. Use hyphens (-) or commas instead.

Generate a personalized outreach email. Return JSON with:
{
  "subject_lines": ["subject 1", "subject 2", "subject 3"],
  "body": "email body with \\n for newlines",
  "email_type": "cold_outreach|follow_up|re_engagement|value_add|soft_pitch|check_in",
  "reasoning": "brief explanation of approach",
  "confidence_score": 0.0-1.0,
  "personalization_hooks_used": ["hook1", "hook2"],
  "suggested_next_action": "what to do after sending"
}`;

      const userPrompt = `Generate an email for this lead:
Name: ${lead.name}
Company: ${lead.company || 'N/A'}
Email: ${lead.email}
Status: ${lead.status}
Segment: ${lead.lead_segment || 'cold'}
Notes: ${lead.notes || 'None'}
${focus ? `Focus: ${focus}` : ''}
${extra_context ? `Extra context: ${extra_context}` : ''}
${commLog.length > 0 ? `Recent emails sent: ${commLog.map(c => c.subject).join(', ')}` : 'No prior emails sent.'}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0].text;
      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = { subject_lines: ['Follow up'], body: text, email_type: 'follow_up', reasoning: '', confidence_score: 0.5, personalization_hooks_used: [], suggested_next_action: '' };
      }

      // Strip em/en dashes from AI output
      parsed.body = stripDashes(parsed.body);
      parsed.subject_lines = (parsed.subject_lines || []).map(s => stripDashes(s));
      parsed.reasoning = stripDashes(parsed.reasoning);
      parsed.suggested_next_action = stripDashes(parsed.suggested_next_action);

      // Save to email queue
      const queueItem = {
        lead_id: lead.id,
        lead_name: lead.name,
        lead_email: lead.email,
        lead_segment: lead.lead_segment || 'cold',
        email_type: parsed.email_type,
        subject_lines: JSON.stringify(parsed.subject_lines),
        body: parsed.body,
        reasoning: parsed.reasoning,
        confidence_score: parsed.confidence_score,
        personalization_hooks_used: JSON.stringify(parsed.personalization_hooks_used),
        suggested_next_action: parsed.suggested_next_action,
        status: 'draft',
        generated_at: new Date().toISOString(),
      };

      const [saved] = await supaFetch('crm_email_queue', { method: 'POST', body: JSON.stringify(queueItem) });
      return res.json({ ...parsed, id: saved.id });
    }

    // POST /api/crm/email-generate?action=batch
    if (req.method === 'POST' && action === 'batch') {
      // Simplified batch - just returns a job ID, actual generation is sequential
      const { segment, lead_ids } = req.body;
      let query = 'crm_leads?select=id,name,email&email=neq.';
      if (segment) query += `&lead_segment=eq.${segment}`;
      if (lead_ids) query += `&id=in.(${lead_ids.join(',')})`;
      query += '&limit=20';

      const leads = await supaFetch(query);
      return res.json({ jobId: 'batch-' + Date.now(), totalLeads: leads.length, message: 'Batch generation started. Generate individually for each lead.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM email-generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}
