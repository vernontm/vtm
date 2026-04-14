const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── Generate a YouTube script ──
  if (action === 'generate' && req.method === 'POST') {
    try {
      const { client_id, prompt, style } = req.body;
      if (!client_id || !prompt) return res.status(400).json({ error: 'client_id and prompt required' });
      if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });

      // Fetch client brand context
      const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
      const client = clients?.[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

      // Fetch knowledge base patterns for this client
      const hooks = await supaFetch(`crm_yt_knowledge_base?client_id=eq.${client_id}&category=eq.hooks&order=created_at.desc&limit=10`);
      const intros = await supaFetch(`crm_yt_knowledge_base?client_id=eq.${client_id}&category=eq.intros&order=created_at.desc&limit=10`);
      const ctas = await supaFetch(`crm_yt_knowledge_base?client_id=eq.${client_id}&category=eq.ctas&order=created_at.desc&limit=10`);

      const hooksContext = (hooks || []).map((h, i) => `${i + 1}. "${h.pattern_text}" (${h.metadata?.type || 'unknown'}, effectiveness: ${h.effectiveness_score || 'N/A'})`).join('\n');
      const introsContext = (intros || []).map((h, i) => `${i + 1}. "${h.pattern_text}" (style: ${h.metadata?.style || 'unknown'})`).join('\n');
      const ctasContext = (ctas || []).map((h, i) => `${i + 1}. "${h.pattern_text}" (placement: ${h.metadata?.placement || 'unknown'})`).join('\n');

      const systemPrompt = `You are an expert YouTube scriptwriter. Generate a structured, production-ready YouTube video script.

BRAND CONTEXT:
Business: ${client.business_name || 'Unknown'}
Industry: ${client.industry || 'Unknown'}
Brand Bible: ${client.brand_bible || 'None provided'}
Target Audience: ${client.target_audience || 'General'}
Tone: ${client.preferred_tone || 'Professional and engaging'}
${style ? `Requested Style: ${style}` : ''}

TOP HOOKS FROM KNOWLEDGE BASE (use these as inspiration):
${hooksContext || 'No hooks in knowledge base yet.'}

TOP INTRO PATTERNS:
${introsContext || 'No intro patterns yet.'}

TOP CTA PATTERNS:
${ctasContext || 'No CTA patterns yet.'}

RULES:
1. NEVER use em dashes. Use commas, periods, or colons instead.
2. The hook must grab attention in the first 3 seconds.
3. Each section should have clear B-roll notes for the editor.
4. Include multiple CTAs placed strategically throughout (not just at the end).
5. The script should feel natural and conversational, not robotic.
6. Match the brand voice and target audience.

Return ONLY valid JSON in this exact format:
{
  "title": "Video title",
  "hook": "The opening hook (first 3-5 seconds)",
  "intro": "The intro section that transitions from hook to main content",
  "sections": [
    {
      "heading": "Section heading",
      "content": "The script content for this section",
      "b_roll_notes": "Suggested B-roll or visual notes for this section"
    }
  ],
  "ctas": [
    {"text": "CTA text", "placement": "beginning|middle|end"}
  ],
  "outro": "The closing section of the video",
  "full_script": "The entire script concatenated as readable text with section markers"
}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`AI script generation failed: ${err}`);
      }

      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let script;
      try {
        script = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) script = JSON.parse(match[0]);
        else throw new Error('Failed to parse AI script response');
      }

      // Save to crm_yt_scripts
      const rows = await supaFetch('crm_yt_scripts', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          title: script.title,
          hook: script.hook,
          intro: script.intro,
          sections: script.sections,
          ctas: script.ctas,
          outro: script.outro,
          full_script: script.full_script,
          source_prompt: prompt,
          status: 'draft',
        }]),
      });

      return res.json(rows?.[0] || script);
    } catch (err) {
      console.error('Generate script error:', err);
      return res.status(500).json({ error: 'Script generation failed: ' + err.message });
    }
  }

  // ── Generate complete package (title, description, tags) ──
  if (action === 'complete-package' && req.method === 'POST') {
    try {
      const { script_id } = req.body;
      if (!script_id) return res.status(400).json({ error: 'script_id required' });
      if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });

      // Fetch the script
      const scripts = await supaFetch(`crm_yt_scripts?id=eq.${script_id}`);
      const script = scripts?.[0];
      if (!script) return res.status(404).json({ error: 'Script not found' });
      if (!script.full_script) return res.status(400).json({ error: 'Script has no full_script content' });

      const sections = script.sections || [];
      const sectionsList = sections.map((s, i) => `Section ${i + 1}: ${s.heading}`).join('\n');

      const systemPrompt = `You are a YouTube SEO and packaging expert. Given a video script, generate:

1. An SEO-optimized, click-worthy YouTube title (max 70 characters). It should create curiosity and include relevant keywords.
2. A YouTube description with timestamps derived from the script sections. Include relevant links, keywords, and a brief summary.
3. An array of YouTube tags for discoverability (15-25 tags).

RULES:
1. NEVER use em dashes. Use commas, periods, or colons instead.
2. Title must be under 70 characters but compelling enough to click.
3. Description should start with a strong 2-3 sentence hook, then timestamps, then links/hashtags.
4. Tags should mix broad and specific keywords.

Return ONLY valid JSON:
{
  "yt_title": "Click-worthy SEO title",
  "yt_description": "Full YouTube description with timestamps",
  "yt_tags": ["tag1", "tag2", "tag3"]
}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Generate a YouTube package for this script:\n\nTitle: ${script.title}\n\nSections:\n${sectionsList}\n\nFull Script:\n${script.full_script.slice(0, 15000)}`,
          }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`AI package generation failed: ${err}`);
      }

      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let pkg;
      try {
        pkg = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) pkg = JSON.parse(match[0]);
        else throw new Error('Failed to parse AI package response');
      }

      // Update the script record
      await supaFetch(`crm_yt_scripts?id=eq.${script_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          yt_title: pkg.yt_title,
          yt_description: pkg.yt_description,
          yt_tags: pkg.yt_tags,
          updated_at: new Date().toISOString(),
        }),
      });

      return res.json({ ...pkg, script_id });
    } catch (err) {
      console.error('Complete package error:', err);
      return res.status(500).json({ error: 'Package generation failed: ' + err.message });
    }
  }

  // ── List scripts ──
  if (req.method === 'GET') {
    try {
      let query = 'crm_yt_scripts?order=created_at.desc';
      if (req.query.client_id) query += `&client_id=eq.${req.query.client_id}`;

      const rows = await supaFetch(query);
      return res.json(rows);
    } catch (err) {
      console.error('List scripts error:', err);
      return res.status(500).json({ error: 'Failed to list scripts: ' + err.message });
    }
  }

  // ── Update a script ──
  if (req.method === 'PUT') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });

      const updates = { ...req.body, updated_at: new Date().toISOString() };

      await supaFetch(`crm_yt_scripts?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      const rows = await supaFetch(`crm_yt_scripts?id=eq.${id}`);
      return res.json(rows?.[0] || { updated: true });
    } catch (err) {
      console.error('Update script error:', err);
      return res.status(500).json({ error: 'Update failed: ' + err.message });
    }
  }

  // ── Delete a script ──
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });

      await supaFetch(`crm_yt_scripts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('Delete script error:', err);
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action or method' });
};
