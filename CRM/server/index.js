require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const { db, now } = require('./db');

const leadsRouter        = require('./routes/leads');
const contactsRouter     = require('./routes/contacts');
const dealsRouter        = require('./routes/deals');
const accountsRouter     = require('./routes/accounts');
const projectsRouter     = require('./routes/projects');
const activitiesRouter   = require('./routes/activities');
const projectItemsRouter = require('./routes/project_items');
const invoicesRouter     = require('./routes/invoices');
const dashboardRouter    = require('./routes/dashboard');
const settingsRouter     = require('./routes/settings');
const emailQueueRouter   = require('./routes/emailQueue');
const emailGenRouter     = require('./routes/emailGenerate');
const commLogRouter      = require('./routes/communicationLog');
const authGmailRouter    = require('./routes/authGmail');
const gmailInboxRouter   = require('./routes/gmailInbox');
const meetingsRouter     = require('./routes/meetings');
const searchRouter           = require('./routes/search');
const manualInvoicesRouter   = require('./routes/manualInvoices');
const notificationsRouter    = require('./routes/notifications');
const quickNotesRouter       = require('./routes/quickNotes');
const leadScoutRouter        = require('./routes/leadScout');
const demoPageRouter         = require('./routes/demoPage');
const aiCallerRouter         = require('./routes/aiCaller');
const todosRouter            = require('./routes/todos');
const contentRouter          = require('./routes/content');

const avatarRenderWorker     = require('./workers/avatarRenderWorker');

const app  = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());

// ── Stripe webhook: needs raw body, registered BEFORE express.json() ──────────
app.post('/api/invoices/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.startsWith('whsec_REPLACE')) {
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }
  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'invoice.paid') {
    const inv = event.data.object;
    const paid_at = inv.status_transitions?.paid_at
      ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
      : now();
    db.get('invoices').find({ stripe_invoice_id: inv.id }).assign({ status: 'paid', paid_at }).write();
    console.log(`💰 Invoice paid: ${inv.id}`);
  }
  res.json({ received: true });
});

// ── JSON middleware for all other routes ─────────────────────────────────────
app.use(express.json());

app.use('/api/leads',             leadsRouter);
app.use('/api/contacts',          contactsRouter);
app.use('/api/deals',             dealsRouter);
app.use('/api/accounts',          accountsRouter);
app.use('/api/projects',          projectsRouter);
app.use('/api/activities',        activitiesRouter);
app.use('/api/project-items',     projectItemsRouter);
app.use('/api/invoices',          invoicesRouter);
app.use('/api/dashboard',         dashboardRouter);
app.use('/api/settings',          settingsRouter);
app.use('/api/email-queue',       emailQueueRouter);
app.use('/api/email-generate',    emailGenRouter);
app.use('/api/communication-log', commLogRouter);
app.use('/auth/gmail',            authGmailRouter); // OAuth redirect — not under /api
app.use('/api/gmail',             gmailInboxRouter);
app.use('/api/meetings',          meetingsRouter);
app.use('/api/search',            searchRouter);
app.use('/api/manual-invoices',   manualInvoicesRouter);
app.use('/api/notifications',     notificationsRouter);
app.use('/api/quick-notes',       quickNotesRouter);
app.use('/api/lead-scout',        leadScoutRouter);
app.use('/api/demo-page',         demoPageRouter);
app.use('/api/ai-caller',         aiCallerRouter);
app.use('/api/todos',             todosRouter);
app.use('/api/content',           contentRouter);

// ── Google Sheets CSV proxy (bypasses CORS for client) ──────────────────────
app.get('/api/proxy-csv', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });
  try {
    const resp = await fetch(url);
    if (!resp.ok) return res.status(resp.status).json({ error: 'Failed to fetch sheet. Make sure it is publicly shared.' });
    const text = await resp.text();
    res.setHeader('Content-Type', 'text/csv');
    res.send(text);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`\n✅ Vernon Tech & Media CRM Server`);
  console.log(`   Running at http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_REPLACE')) {
    console.log(`   ⚠️  Stripe not configured — edit server/.env to enable invoicing`);
  } else {
    console.log(`   💳 Stripe ready ✓`);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`   ⚠️  ANTHROPIC_API_KEY not set — add to server/.env for AI email generation`);
  } else {
    console.log(`   🤖 Anthropic API ready ✓`);
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log(`   ⚠️  Gmail OAuth not configured — see Settings > Email Campaign to connect`);
  } else {
    console.log(`   📧 Gmail OAuth configured ✓`);
  }
  if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.startsWith('YOUR_')) {
    console.log(`   ⚠️  ElevenLabs not configured — add ELEVENLABS_API_KEY/AGENT_ID/PHONE_NUMBER_ID to server/.env`);
  } else {
    console.log(`   📞 ElevenLabs AI Caller ready ✓`);
  }
  if (!process.env.HEYGEN_API_KEY) {
    console.log(`   ⚠️  HeyGen not configured — add HEYGEN_API_KEY to server/.env for avatar render worker`);
  } else if (!process.env.SUPABASE_URL && !process.env.CRM_SUPABASE_URL) {
    console.log(`   ⚠️  Supabase not configured on server — avatar render worker disabled`);
  } else {
    console.log(`   🎬 Avatar render worker ready ✓`);
  }
  console.log('');
  avatarRenderWorker.start();
});
