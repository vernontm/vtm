export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const lead = req.body;

  if (!lead || !lead.name) {
    return res.status(400).json({ error: 'Lead data required' });
  }

  const CRM_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
  const CRM_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  const results = { supabase: null, zapier: null };

  // 1. Save to CRM Supabase (crm_leads table)
  try {
    const supabaseRes = await fetch(
      `${CRM_URL}/rest/v1/crm_leads`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CRM_KEY,
          'Authorization': `Bearer ${CRM_KEY}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name: lead.name || '',
          email: lead.email || '',
          phone: lead.phone || '',
          company: lead.business || '',
          lead_source: lead.source || 'vtm-chat',
          notes: [
            lead.problem ? `Problem: ${lead.problem}` : '',
            lead.current_state ? `Current state: ${lead.current_state}` : '',
            lead.goal ? `Goal: ${lead.goal}` : '',
            lead.budget_tier ? `Budget: ${lead.budget_tier}` : '',
            lead.best_time ? `Best time: ${lead.best_time}` : '',
            lead.notes || '',
          ].filter(Boolean).join('\n'),
          status: 'New Lead',
          lead_segment: 'warm',
          budget: lead.budget_tier || '',
          current_situation: lead.current_state || '',
          financial_goal: lead.goal || '',
        }),
      }
    );

    if (supabaseRes.ok) {
      results.supabase = 'saved';
    } else {
      const err = await supabaseRes.text();
      console.error('Supabase error:', err);
      results.supabase = 'error';
    }
  } catch (err) {
    console.error('Supabase save failed:', err);
    results.supabase = 'error';
  }

  // 2. Build summary
  const parts = [];
  if (lead.name) parts.push(`${lead.name}`);
  if (lead.business) parts.push(`from ${lead.business}`);
  if (lead.problem) parts.push(`needs help with: ${lead.problem}`);
  if (lead.current_state) parts.push(`Currently: ${lead.current_state}`);
  if (lead.goal) parts.push(`Goal: ${lead.goal}`);
  if (lead.budget_tier) parts.push(`Budget: ${lead.budget_tier}`);
  if (lead.best_time) parts.push(`Best time to reach: ${lead.best_time}`);
  if (lead.email) parts.push(`Email: ${lead.email}`);
  if (lead.phone) parts.push(`Phone: ${lead.phone}`);
  if (lead.notes) parts.push(`Notes: ${lead.notes}`);
  const summary = parts.join('. ') + '.';

  // 3. Send to Zapier webhook
  try {
    const zapierRes = await fetch(
      'https://hooks.zapier.com/hooks/catch/12135291/u7ub25s/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          business: lead.business,
          problem: lead.problem,
          current_state: lead.current_state,
          goal: lead.goal,
          budget_tier: lead.budget_tier,
          best_time: lead.best_time,
          notes: lead.notes,
          summary: summary,
          source: lead.source || 'vtm-chat',
          timestamp: new Date().toISOString(),
        }),
      }
    );

    if (zapierRes.ok) {
      results.zapier = 'sent';
    } else {
      console.error('Zapier error:', zapierRes.status);
      results.zapier = 'error';
    }
  } catch (err) {
    console.error('Zapier send failed:', err);
    results.zapier = 'error';
  }

  return res.status(200).json({ success: true, results });
}
