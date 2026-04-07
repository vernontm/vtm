import { setCors, requireAuth } from '../_lib/supabase.js';
import { getInboxThreads } from '../_lib/gmail.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { maxResults, pageToken, labelName } = req.query;

  try {
    const result = await getInboxThreads({
      maxResults: maxResults ? parseInt(maxResults) : 30,
      pageToken: pageToken || undefined,
      labelName: labelName || undefined,
    });
    return res.json(result);
  } catch (err) {
    console.error('Gmail inbox error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
