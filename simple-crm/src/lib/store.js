// Local (browser-storage) data layer used when Supabase is not configured.
// Everything persists to localStorage so the demo CRM behaves like a real app:
// create / edit / delete survive refreshes. Swap to Supabase by adding keys.

const STORAGE_KEY = 'crm_demo_data_v1'

export const uid = () =>
  (crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`)

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString()

// ---- Domain option sets ------------------------------------------------

export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Won', 'Lost']
export const LEAD_SOURCES = ['Website', 'Referral', 'Cold Email', 'Social', 'Event']
export const DEAL_STAGES = ['Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']

// ---- Seed data ---------------------------------------------------------

function seed() {
  const contacts = [
    { id: uid(), name: 'Maya Chen', email: 'maya@brightloop.io', phone: '(415) 555-0142', company: 'BrightLoop', title: 'Head of Growth', createdAt: daysAgo(40) },
    { id: uid(), name: 'Andre Silva', email: 'andre@nordpeak.co', phone: '(212) 555-0198', company: 'NordPeak', title: 'Founder', createdAt: daysAgo(31) },
    { id: uid(), name: 'Priya Nair', email: 'priya@havenlabs.com', phone: '(646) 555-0111', company: 'Haven Labs', title: 'VP Operations', createdAt: daysAgo(22) },
    { id: uid(), name: 'Devon Brooks', email: 'devon@summitgrid.com', phone: '(305) 555-0176', company: 'SummitGrid', title: 'Marketing Lead', createdAt: daysAgo(12) },
    { id: uid(), name: 'Lena Okafor', email: 'lena@quantafold.ai', phone: '(737) 555-0155', company: 'Quantafold', title: 'CEO', createdAt: daysAgo(5) },
  ]

  const leads = [
    { id: uid(), name: 'Marcus Reid', email: 'marcus@tidewave.co', company: 'Tidewave', source: 'Website', status: 'New', value: 4200, createdAt: daysAgo(2) },
    { id: uid(), name: 'Sofia Ramos', email: 'sofia@peakforge.io', company: 'PeakForge', source: 'Referral', status: 'Contacted', value: 9800, createdAt: daysAgo(6) },
    { id: uid(), name: 'Jamal Carter', email: 'jamal@brightloop.io', company: 'BrightLoop', source: 'Cold Email', status: 'Qualified', value: 15000, createdAt: daysAgo(9) },
    { id: uid(), name: 'Elena Popov', email: 'elena@northstar.co', company: 'Northstar', source: 'Event', status: 'New', value: 3000, createdAt: daysAgo(1) },
    { id: uid(), name: 'Tobias Fry', email: 'tobias@havenlabs.com', company: 'Haven Labs', source: 'Social', status: 'Won', value: 22000, createdAt: daysAgo(18) },
    { id: uid(), name: 'Grace Lim', email: 'grace@loomstack.com', company: 'Loomstack', source: 'Website', status: 'Lost', value: 5000, createdAt: daysAgo(25) },
  ]

  const deals = [
    { id: uid(), title: 'BrightLoop — Annual Plan', company: 'BrightLoop', contact: 'Maya Chen', stage: 'Proposal', value: 24000, closeDate: daysAhead(14), createdAt: daysAgo(20) },
    { id: uid(), title: 'NordPeak — Team Seats', company: 'NordPeak', contact: 'Andre Silva', stage: 'Negotiation', value: 41000, closeDate: daysAhead(6), createdAt: daysAgo(28) },
    { id: uid(), title: 'Haven Labs — Onboarding', company: 'Haven Labs', contact: 'Priya Nair', stage: 'Qualified', value: 12500, closeDate: daysAhead(30), createdAt: daysAgo(8) },
    { id: uid(), title: 'SummitGrid — Pilot', company: 'SummitGrid', contact: 'Devon Brooks', stage: 'Won', value: 18000, closeDate: daysAgo(3), createdAt: daysAgo(35) },
    { id: uid(), title: 'Quantafold — Expansion', company: 'Quantafold', contact: 'Lena Okafor', stage: 'Proposal', value: 56000, closeDate: daysAhead(21), createdAt: daysAgo(11) },
  ]

  const meetings = [
    { id: uid(), title: 'Discovery call', contact: 'Maya Chen', company: 'BrightLoop', date: daysAhead(1), notes: 'Walk through pricing tiers and rollout plan.', createdAt: daysAgo(3) },
    { id: uid(), title: 'Proposal review', contact: 'Andre Silva', company: 'NordPeak', date: daysAhead(3), notes: 'Address security questionnaire.', createdAt: daysAgo(2) },
    { id: uid(), title: 'Quarterly check-in', contact: 'Devon Brooks', company: 'SummitGrid', date: daysAhead(5), notes: 'Review pilot metrics, discuss expansion.', createdAt: daysAgo(1) },
  ]

  const activities = [
    { id: uid(), type: 'deal', text: 'Deal "SummitGrid — Pilot" moved to Won', createdAt: daysAgo(3) },
    { id: uid(), type: 'lead', text: 'New lead Marcus Reid added from Website', createdAt: daysAgo(2) },
    { id: uid(), type: 'meeting', text: 'Meeting scheduled with Andre Silva', createdAt: daysAgo(2) },
    { id: uid(), type: 'contact', text: 'Contact Lena Okafor created', createdAt: daysAgo(5) },
  ]

  return { contacts, leads, deals, meetings, activities }
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fall through to seed
  }
  const fresh = seed()
  saveData(fresh)
  return fresh
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore quota / private-mode failures
  }
}

export function resetData() {
  const fresh = seed()
  saveData(fresh)
  return fresh
}

export function clearData() {
  const empty = { contacts: [], leads: [], deals: [], meetings: [], activities: [] }
  saveData(empty)
  return empty
}
