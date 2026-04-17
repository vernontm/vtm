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
  // VTM's own email list client ID (the "Ray" client in crm_clients)
  const VTM_EMAIL_CLIENT_ID = process.env.VTM_EMAIL_CLIENT_ID || '27231196-0aac-45f6-ad3c-427bf09310ae';

  const results = { supabase: null, emailList: null, zapier: null };

  const hasPhone = !!(lead.phone || '').trim();

  // 1. Always add to VTM email list (crm_email_contacts) with "warm lead" tag
  if (lead.email) {
    try {
      await fetch(`${CRM_URL}/rest/v1/crm_email_contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CRM_KEY,
          'Authorization': `Bearer ${CRM_KEY}`,
          'Prefer': 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          client_id: VTM_EMAIL_CLIENT_ID,
          email: lead.email.toLowerCase().trim(),
          name: lead.name || '',
          tags: ['warm lead'],
          status: 'active',
          signed_up_at: new Date().toISOString(),
        }),
      });
      results.emailList = 'added';
    } catch (err) {
      console.error('Email list add failed:', err);
      results.emailList = 'error';
    }
  }

  // 2. Save to crm_leads ONLY if a phone number was provided (admin needs to call them)
  let isNewLead = true;
  if (hasPhone) {
  try {
    const leadRow = {
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
      status: 'Warm',
      lead_segment: 'warm',
    };

    // If we have an email, check for existing lead and update instead
    let supabaseRes;
    if (lead.email) {
      const checkRes = await fetch(
        `${CRM_URL}/rest/v1/crm_leads?email=eq.${encodeURIComponent(lead.email)}&select=id&limit=1`,
        { headers: { 'apikey': CRM_KEY, 'Authorization': `Bearer ${CRM_KEY}` } }
      );
      const existing = await checkRes.json();

      if (existing && existing.length > 0) {
        // Update existing lead — only overwrite non-empty fields
        isNewLead = false;
        const updateData = {};
        Object.entries(leadRow).forEach(([k, v]) => {
          if (v && k !== 'status' && k !== 'lead_segment' && k !== 'lead_source') updateData[k] = v;
        });
        updateData.updated_at = new Date().toISOString();

        supabaseRes = await fetch(
          `${CRM_URL}/rest/v1/crm_leads?id=eq.${existing[0].id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CRM_KEY,
              'Authorization': `Bearer ${CRM_KEY}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(updateData),
          }
        );
      } else {
        // Insert new lead
        supabaseRes = await fetch(
          `${CRM_URL}/rest/v1/crm_leads`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CRM_KEY,
              'Authorization': `Bearer ${CRM_KEY}`,
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(leadRow),
          }
        );
      }
    } else {
      // No email — just insert (can't deduplicate without email)
      supabaseRes = await fetch(
        `${CRM_URL}/rest/v1/crm_leads`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CRM_KEY,
            'Authorization': `Bearer ${CRM_KEY}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(leadRow),
        }
      );
    }

    if (supabaseRes.ok) {
      results.supabase = isNewLead ? 'saved' : 'updated';
    } else {
      const err = await supabaseRes.text();
      console.error('Supabase error:', err);
      results.supabase = 'error';
    }
  } catch (err) {
    console.error('Supabase save failed:', err);
    results.supabase = 'error';
  }
  } else {
    results.supabase = 'skipped (no phone)';
  }

  // 4. Only send to Zapier on final summary (not progressive saves)
  // Progressive saves (source: vtm-chat-progress) skip Zapier
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

  // 5. Auto-draft email + schedule follow-up (only on final submission with email)
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
