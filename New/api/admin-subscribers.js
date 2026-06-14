import crypto from 'crypto';

function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const [expiry, hmac] = token.split('.');
  if (!expiry || !hmac) return false;
  if (Date.now() > parseInt(expiry)) return false;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(`${expiry}`).digest('hex');
  return hmac === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const CRM_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
  const CRM_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const VTM_EMAIL_CLIENT_ID = process.env.VTM_EMAIL_CLIENT_ID || '27231196-0aac-45f6-ad3c-427bf09310ae';

  const { source } = req.query;

  try {
    let path = `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&select=id,email,name,tags,status,signed_up_at,created_at&order=signed_up_at.desc.nullslast,created_at.desc&limit=2000`;
    if (source === 'resources') {
      // tags is a text[] column; ?tags=cs.{resources} = contains
      path = `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&or=(tags.cs.{resources},tags.cs.{prompts},tags.cs.{traders},tags.cs.{crm})&select=id,email,name,tags,status,signed_up_at,created_at&order=signed_up_at.desc.nullslast,created_at.desc&limit=2000`;
    }
    const response = await fetch(`${CRM_URL}/rest/v1/${path}`, {
      headers: { 'apikey': CRM_KEY, 'Authorization': `Bearer ${CRM_KEY}` },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Subscribers fetch error:', response.status, text);
      return res.status(502).json({ error: 'Database error' });
    }
    const subs = await response.json();
    return res.status(200).json(subs);
  } catch (err) {
    console.error('Admin subscribers error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
