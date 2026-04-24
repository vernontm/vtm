import { setCors, requireAuth } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

const PEOPLE_API = 'https://people.googleapis.com/v1';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, pageSize = '100' } = req.query;

  try {
    const { accessToken } = await getGmailAuth();

    // If search query, use people.searchContacts
    if (q) {
      const params = new URLSearchParams({
        query: q,
        readMask: 'names,emailAddresses,photos',
        pageSize: Math.min(parseInt(pageSize), 30).toString(),
      });
      const r = await fetch(`${PEOPLE_API}/people:searchContacts?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        // Fallback: People API search requires a specific scope, try otherContacts
        const r2 = await fetch(`${PEOPLE_API}/otherContacts:search?query=${encodeURIComponent(q)}&readMask=names,emailAddresses&pageSize=${Math.min(parseInt(pageSize), 30)}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (!r2.ok) return res.json({ contacts: [] });
        const data2 = await r2.json();
        return res.json({ contacts: parseContacts(data2.results || []) });
      }
      const data = await r.json();
      return res.json({ contacts: parseContacts(data.results || []) });
    }

    // List contacts (connections)
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,photos',
      pageSize: Math.min(parseInt(pageSize), 100).toString(),
      sortOrder: 'LAST_MODIFIED_DESCENDING',
    });
    const r = await fetch(`${PEOPLE_API}/people/me/connections?${params}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!r.ok) {
      // People API may not be enabled — return empty
      return res.json({ contacts: [] });
    }
    const data = await r.json();
    const contacts = (data.connections || [])
      .filter(c => c.emailAddresses?.length > 0)
      .map(c => ({
        name: c.names?.[0]?.displayName || '',
        email: c.emailAddresses[0].value,
        photo: c.photos?.[0]?.url || '',
      }));

    return res.json({ contacts });
  } catch (err) {
    console.error('Gmail contacts error:', err.message);
    return res.json({ contacts: [] }); // Graceful fallback
  }
}

function parseContacts(results) {
  return results
    .map(r => {
      const person = r.person || r;
      const email = person.emailAddresses?.[0]?.value;
      if (!email) return null;
      return {
        name: person.names?.[0]?.displayName || '',
        email,
        photo: person.photos?.[0]?.url || '',
      };
    })
    .filter(Boolean);
}
