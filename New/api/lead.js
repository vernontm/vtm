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
          problem: lead.problem || '',
          current_situation: lead.current_state || '',
          financial_goal: lead.goal || '',
          budget: lead.budget_tier || '',
          best_time: lead.best_time || '',
          notes: lead.notes || '',
          status: 'New Lead',
          lead_segment: 'warm',
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

  // 2. Only send to Zapier on final summary (not progressive saves)
  // Progressive saves (source: vtm-chat-progress) go to Supabase only
  // Final summary (source: vtm-chat) triggers Zapier for email automation
  const isProgressiveSave = (lead.source || '').includes('progress');

  if (!isProgressiveSave) {
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
  } else {
    results.zapier = 'skipped (progressive save)';
  }

  // 3. Auto-draft email + schedule follow-up (only on final submission with email)
  if (!isProgressiveSave && lead.email) {
    try {
      const firstName = (lead.name || '').split(' ')[0] || 'there';
      const draftSubject = `Hey ${firstName} — following up from Vernon Tech & Media`;
      const draftBody = [
        `Hey ${firstName},`,
        '',
        `Thanks for reaching out through our site! I saw you're looking for help with ${lead.problem || 'your project'}.`,
        '',
        lead.current_state ? `It sounds like right now: ${lead.current_state}.` : '',
        lead.goal ? `And your goal is: ${lead.goal}.` : '',
        '',
        `I'd love to hop on a quick call to see how we can help. What does your schedule look like${lead.best_time ? ` around ${lead.best_time}` : ' this week'}?`,
        '',
        'Talk soon,',
        'Ray Vernon',
        'Vernon Tech & Media',
      ].filter(Boolean).join('\n');

      // Create auto-draft in email queue
      await fetch(`${CRM_URL}/rest/v1/crm_email_queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CRM_KEY,
          'Authorization': `Bearer ${CRM_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          to_email: lead.email,
          lead_name: lead.name,
          subject: draftSubject,
          body: draftBody,
          status: 'draft',
          auto_generated: true,
          created_at: new Date().toISOString(),
        }),
      });

      // Schedule 3-day follow-up draft
      const followUpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await fetch(`${CRM_URL}/rest/v1/crm_email_queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CRM_KEY,
          'Authorization': `Bearer ${CRM_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          to_email: lead.email,
          lead_name: lead.name,
          subject: `Quick follow-up, ${firstName}`,
          body: `Hey ${firstName},\n\nJust wanted to circle back — I know things get busy. If you're still interested in ${lead.problem || 'getting started'}, I'm happy to find a time that works.\n\nNo pressure at all, just don't want you to miss out.\n\nBest,\nRay Vernon\nVernon Tech & Media`,
          status: 'draft',
          auto_generated: true,
          follow_up_date: followUpDate,
          created_at: new Date().toISOString(),
        }),
      });

      results.autoDraft = 'created';
    } catch (err) {
      console.error('Auto-draft failed:', err);
      results.autoDraft = 'error';
    }
  }

  return res.status(200).json({ success: true, results });
}
