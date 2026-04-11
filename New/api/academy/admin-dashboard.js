import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [profiles, courses, lessons, homework] = await Promise.all([
      supaFetch('academy_profiles?select=id,subscription_status'),
      supaFetch('academy_courses?select=id'),
      supaFetch('academy_lessons?select=id'),
      supaFetch('academy_homework_submissions?status=eq.submitted&select=id'),
    ]);

    const totalStudents = profiles.length;
    const activeSubscribers = profiles.filter(p => p.subscription_status === 'active').length;
    const totalCourses = courses.length;
    const totalLessons = lessons.length;
    const homeworkPending = homework.length;

    // Revenue this month from Stripe
    let revenueThisMonth = 0;
    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    if (STRIPE_KEY && !STRIPE_KEY.includes('REPLACE')) {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startTs = Math.floor(startOfMonth.getTime() / 1000);
        const stripeRes = await fetch(
          `https://api.stripe.com/v1/charges?created[gte]=${startTs}&limit=100&status=succeeded`,
          { headers: { 'Authorization': `Bearer ${STRIPE_KEY}` } }
        );
        if (stripeRes.ok) {
          const data = await stripeRes.json();
          revenueThisMonth = data.data.reduce((s, c) => s + c.amount, 0) / 100;
        }
      } catch (stripeErr) {
        console.error('Stripe fetch error:', stripeErr.message);
      }
    }

    return res.json({
      total_students: totalStudents,
      active_subscribers: activeSubscribers,
      total_courses: totalCourses,
      total_lessons: totalLessons,
      homework_pending: homeworkPending,
      revenue_this_month: revenueThisMonth,
    });
  } catch (err) {
    console.error('Academy admin-dashboard error:', err);
    return res.status(500).json({ error: err.message });
  }
}
