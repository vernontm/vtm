const { setCors, requireAdminAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAdminAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { action, lesson_id, transcript, content } = req.body;

    if (!action) return res.status(400).json({ error: 'action required' });

    const textContent = transcript || content || '';

    if (action === 'generate-title') {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: `Based on the following lesson content, generate:\n1. A concise, compelling lesson title (max 10 words)\n2. A 2-3 sentence description of what students will learn\n\nReturn JSON: {"title": "...", "description": "..."}\n\nContent:\n${textContent.slice(0, 4000)}` }],
          system: 'You are an expert course content creator. Return ONLY valid JSON, no markdown.',
        }),
      });
      if (!aiRes.ok) throw new Error('AI generation failed');
      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return res.json(JSON.parse(raw));
    }

    if (action === 'generate-quiz') {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: `Based on this lesson content, generate 5 multiple-choice quiz questions.\n\nReturn JSON array: [{"question": "...", "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}], "correct_option_id": "a"}]\n\nContent:\n${textContent.slice(0, 4000)}` }],
          system: 'You are a quiz creator for online courses. Questions should test comprehension. Return ONLY valid JSON.',
        }),
      });
      if (!aiRes.ok) throw new Error('AI generation failed');
      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return res.json({ questions: JSON.parse(raw) });
    }

    if (action === 'generate-homework') {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `Based on this lesson content, create a practical homework assignment that requires students to apply what they learned.\n\nReturn JSON: {"title": "...", "prompt": "detailed assignment description", "deliverables": ["list", "of", "what to submit"]}\n\nContent:\n${textContent.slice(0, 4000)}` }],
          system: 'You are a course instructor. Create actionable, hands-on assignments. Return ONLY valid JSON.',
        }),
      });
      if (!aiRes.ok) throw new Error('AI generation failed');
      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return res.json(JSON.parse(raw));
    }

    return res.status(400).json({ error: 'Invalid action. Use: generate-title, generate-quiz, generate-homework' });
  } catch (err) {
    console.error('ai-generate error:', err);
    return res.status(500).json({ error: err.message });
  }
};
