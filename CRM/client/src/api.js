import { supabase } from './lib/supabase';

const BASE = '/api/crm';

// Module-level current client. ClientContext keeps this in sync with the
// global switcher so every API call automatically scopes to the active client.
let _currentClientId = null;
try {
  const stored = typeof localStorage !== 'undefined'
    ? localStorage.getItem('vtm.crm.selectedClientId')
    : null;
  if (stored) _currentClientId = stored;
} catch (_) { /* ignore */ }

export function setCurrentClientId(id) { _currentClientId = id || null; }
export function getCurrentClientId() { return _currentClientId; }

async function request(path, options = {}) {
  // Get the current Supabase session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(_currentClientId ? { 'X-Client-Id': _currentClientId } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
    // Callers that care can branch on these (e.g. a 503 with needs_migration
    // means "the table is not there yet", so hide the feature quietly).
    e.status = res.status;
    e.needs_migration = !!err.needs_migration;
    e.body = err;
    throw e;
  }
  return res.json();
}

// Current user + accessible clients (multi-tenant bootstrap)
export const getMe = () => request('/me');

// SMS inbox (two-way texting from the VTM number)
export const getSmsThreads = () => request('/sms');
export const getSmsThread  = (phone) => request(`/sms?phone=${encodeURIComponent(phone)}`);
export const sendSms       = (phone, body) => request('/sms?action=send', { method: 'POST', body: JSON.stringify({ phone, body }) });

// iMessage inbox. Sends are queued here and delivered by the bridge running on
// the Mac signed into the business Apple ID (see imessage-bridge/).
export const getImsgThreads = () => request('/imessage');
export const getImsgThread  = (phone) => request(`/imessage?phone=${encodeURIComponent(phone)}`);
// attachments is optional: [{ url, type, name, mime, size, width, height }].
// With at least one attachment the body may be empty.
export const sendImsg       = (phone, body, attachments) => request('/imessage?action=send', { method: 'POST', body: JSON.stringify({ phone, body, attachments: attachments && attachments.length ? attachments : undefined }) });
// People you can text (leads + clients + contacts), for the Inbox To picker.
export const getImsgDirectory = () => request('/imessage?action=directory');
// Assign a conversation (by phone) to an employee, or unassign with nulls.
export const assignImsgThread = (phone, assigned_to, assigned_to_name) =>
  request('/imessage?action=assign', { method: 'POST', body: JSON.stringify({ phone, assigned_to, assigned_to_name }) });
// Change a conversation's type: 'lead' | 'client' | 'contact'.
export const setImsgKind  = (phone, kind) => request('/imessage?action=set-kind', { method: 'POST', body: JSON.stringify({ phone, kind }) });
// CRM assistant (Claude with tools: availability, follow-ups, people, agenda).
export const askAssistant = (prompt, conversation = []) => request('/assistant', { method: 'POST', body: JSON.stringify({ prompt, conversation }) });
// Actions mode: the assistant reads a conversation and proposes things to do,
// such as texting a customer it decided we should reach.
export const proposeActions = (prompt) => request('/assistant', { method: 'POST', body: JSON.stringify({ prompt, mode: 'actions' }) });
// Google Places location search for the meeting scheduler (server-proxied key).
export const searchPlaces = (q) => request(`/places?q=${encodeURIComponent(q)}`);
export const getPlaceDetail = (placeId) => request(`/places?place_id=${encodeURIComponent(placeId)}`);
// Open scheduling slots (work hours minus booked calendar).
export const getAvailability = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/availability${qs ? '?' + qs : ''}`);
};
// Mark a conversation read for the current user (clears its unread badge).
export const markImsgRead = (phone) => request('/imessage?action=read', { method: 'POST', body: JSON.stringify({ phone }) });
// Internal notes on a conversation, attributed to the logged-in employee.
export const getImsgNotes = (phone) => request(`/imessage?action=notes&phone=${encodeURIComponent(phone)}`);
export const addImsgNote  = (phone, body) => request('/imessage?action=note', { method: 'POST', body: JSON.stringify({ phone, body }) });
// Handoff events (assignee changes) for a conversation.
export const getImsgEvents = (phone) => request(`/imessage?action=events&phone=${encodeURIComponent(phone)}`);

// Tasks / priorities (assignable to a client)
export const getTasks   = (status) => request(`/tasks${status ? `?status=${status}` : ''}`);
export const createTask = (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateTask = (id, data) => request(`/tasks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTask = (id) => request(`/tasks?id=${id}`, { method: 'DELETE' });

// Admin: user management
export const getAdminUsers    = () => request('/admin-users');
export const createAdminUser  = (data) => request('/admin-users', { method: 'POST', body: JSON.stringify(data) });
export const updateAdminUser  = (id, data) => request(`/admin-users?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAdminUser  = (id) => request(`/admin-users?id=${id}`, { method: 'DELETE' });

// Admin: who gets which push notifications (mobile app)
// Client files: folders, uploads, drag-to-organize
const fileToB64 = (file) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
});
export const listClientFiles = (clientId, path = '') => request(`/client-files?action=list&client_id=${clientId}&path=${encodeURIComponent(path)}`);
export const listClientFolders = (clientId) => request(`/client-files?action=tree&client_id=${clientId}`);
export const createClientFolder = (clientId, path, name) => request('/client-files?action=mkdir', { method: 'POST', body: JSON.stringify({ client_id: clientId, path, name }) });
export const renameClientFile = (id, name) => request('/client-files?action=rename', { method: 'POST', body: JSON.stringify({ id, name }) });
export const moveClientFile = (id, toPath) => request('/client-files?action=move', { method: 'POST', body: JSON.stringify({ id, to_path: toPath }) });
export const deleteClientFile = (id) => request('/client-files?action=delete', { method: 'POST', body: JSON.stringify({ id }) });
export const uploadClientFile = async (clientId, file, path = '') => {
  // Direct-to-storage upload. The bytes never pass through our API, so this
  // skips Vercel's ~4.5MB request-body cap and is much faster for big files.
  const signed = await request('/client-files?action=sign-upload', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, path, filename: file.name, size: file.size }),
  });
  const put = await fetch(signed.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}): ${await put.text().catch(() => '')}`.slice(0, 200));
  return request('/client-files?action=register', {
    method: 'POST',
    body: JSON.stringify({
      client_id: clientId, path: signed.path, filename: signed.name,
      key: signed.key, mime: file.type || 'application/octet-stream', size: file.size,
    }),
  });
};

export const getPushPrefs = () => request('/push?action=prefs');
export const setPushPrefs = (userId, prefs) => request('/push?action=set-prefs', { method: 'POST', body: JSON.stringify({ user_id: userId, prefs }) });
export const resetUserPassword = (id, password) => request(`/admin-users?id=${id}&action=reset-password`, { method: 'PUT', body: JSON.stringify({ password }) });
export const upsertUserGrant  = (id, data) => request(`/admin-users?id=${id}&action=grant`, { method: 'POST', body: JSON.stringify(data) });
export const revokeUserGrant  = (id, client_id) => request(`/admin-users?id=${id}&client_id=${client_id}&action=grant`, { method: 'DELETE' });

// Leads
export const getLeads    = () => request('/leads');
export const createLead  = (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) });
export const updateLead  = (id, data) => request(`/leads?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLead  = (id) => request(`/leads?id=${id}`, { method: 'DELETE' });
export const convertLead  = (id) => request(`/leads?id=${id}&action=convert`, { method: 'POST' });
export const syncLeadGmail = (id) => request(`/leads?id=${id}&action=sync-gmail`, { method: 'POST' });
export const bulkImportLeads = (leads) => request('/leads?action=bulk', { method: 'POST', body: JSON.stringify({ leads }) });

// Contacts
export const getContacts    = () => request('/contacts');
export const createContact  = (data) => request('/contacts', { method: 'POST', body: JSON.stringify(data) });
export const updateContact  = (id, data) => request(`/contacts?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteContact  = (id) => request(`/contacts?id=${id}`, { method: 'DELETE' });

// Deals, the billable container: one agreement + one combined invoice,
// grouping a client's projects. Pass a crm_clients.id to scope to that client.
export const getDeals    = (clientId) => request(`/deals${clientId ? `?client_id=${clientId}` : ''}`);
export const createDeal  = (data) => request('/deals', { method: 'POST', body: JSON.stringify(data) });
export const updateDeal  = (id, data) => request(`/deals?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDeal  = (id) => request(`/deals?id=${id}`, { method: 'DELETE' });
export const createDealInvoice = (id, data) => request(`/deal-invoice?id=${id}`, { method: 'POST', body: JSON.stringify(data) });

// Time tracking, employee clocks in/out; admin reviews + settles.
export const getTimeEntries   = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/time-entries${qs ? '?' + qs : ''}`); };
export const clockIn          = (data = {}) => request('/time-entries?action=clock-in', { method: 'POST', body: JSON.stringify(data) });
export const clockOut         = (data = {}) => request('/time-entries?action=clock-out', { method: 'POST', body: JSON.stringify(data) });
export const addTimeEntry     = (data) => request('/time-entries?action=add', { method: 'POST', body: JSON.stringify(data) });
export const markTimePaid     = (data) => request('/time-entries?action=mark-paid', { method: 'POST', body: JSON.stringify(data) });
export const payTimeRange     = (data) => request('/time-entries?action=pay-range', { method: 'POST', body: JSON.stringify(data) });
export const setEmployeeRate  = (data) => request('/time-entries?action=set-rate', { method: 'POST', body: JSON.stringify(data) });
export const updateTimeEntry  = (id, data) => request(`/time-entries?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTimeEntry  = (id) => request(`/time-entries?id=${id}`, { method: 'DELETE' });
// Influencer shoots and per-shoot invoicing. The server owns the money math
// (minimum, quarter-hour rounding, mileage); these just carry what happened.
export const addShoot         = (data) => request('/time-entries?action=add-shoot', { method: 'POST', body: JSON.stringify(data) });
export const submitStatement  = (data) => request('/time-entries?action=submit-statement', { method: 'POST', body: JSON.stringify(data) });
export const approveStatement = (data) => request('/time-entries?action=approve-statement', { method: 'POST', body: JSON.stringify(data) });
export const disputeStatement = (data) => request('/time-entries?action=dispute-statement', { method: 'POST', body: JSON.stringify(data) });
export const payStatement     = (data) => request('/time-entries?action=pay-statement', { method: 'POST', body: JSON.stringify(data) });
export const inviteUser       = (data) => request('/admin-users?action=invite', { method: 'POST', body: JSON.stringify(data) });

// Per-project delivery board: phases, steps, comments, period reports.
export const getProjectBoard    = (projectId) => request(`/project-board?project_id=${projectId}`);
export const seedProjectBoard   = (projectId, data = {}) => request(`/project-board?action=seed-template&project_id=${projectId}`, { method: 'POST', body: JSON.stringify(data) });
export const addProjectItem     = (projectId, data) => request(`/project-board?action=item&project_id=${projectId}`, { method: 'POST', body: JSON.stringify(data) });
export const updateProjectItem  = (id, data) => request(`/project-board?id=${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteProjectItem  = (id) => request(`/project-board?id=${id}`, { method: 'DELETE' });
export const addProjectComment  = (projectId, data) => request(`/project-board?action=comment&project_id=${projectId}`, { method: 'POST', body: JSON.stringify(data) });
export const buildProjectReport = (projectId, data) => request(`/project-board?action=report&project_id=${projectId}`, { method: 'POST', body: JSON.stringify(data) });

// Employee roster. Distinct from the login list: a person exists here before
// they have an account, and clients never appear.
export const getEmployees    = () => request('/employees');
// Lightweight roster for assignee pickers (any signed-in user; no pay/hours).
export const getAssignees    = () => request('/assignees');
export const addEmployee     = (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployee  = (id, data) => request(`/employees?id=${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const removeEmployee  = (id) => request(`/employees?id=${id}`, { method: 'DELETE' });
export const inviteEmployee  = (id) => request(`/employees?action=invite&id=${id}`, { method: 'POST', body: '{}' });

// Employee resources, internal team hub (SOPs, guides, links). Admin edits.
export const getEmployeeResources    = () => request('/employee-resources');
export const createEmployeeResource  = (data) => request('/employee-resources', { method: 'POST', body: JSON.stringify(data) });
export const updateEmployeeResource  = (id, data) => request(`/employee-resources?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmployeeResource  = (id) => request(`/employee-resources?id=${id}`, { method: 'DELETE' });

// Manual Invoices
export const getManualInvoices   = (deal_id) => request(`/manual-invoices${deal_id ? '?deal_id=' + deal_id : ''}`);
export const createManualInvoice = (data)    => request('/manual-invoices', { method: 'POST', body: JSON.stringify(data) });
export const updateManualInvoice = (id, data) => request(`/manual-invoices?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteManualInvoice = (id)      => request(`/manual-invoices?id=${id}`, { method: 'DELETE' });

// Accounts
export const getAccounts    = () => request('/accounts');
export const createAccount  = (data) => request('/accounts', { method: 'POST', body: JSON.stringify(data) });
export const updateAccount  = (id, data) => request(`/accounts?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAccount  = (id) => request(`/accounts?id=${id}`, { method: 'DELETE' });

// Projects
export const getProjects    = () => request('/projects');
export const createProject  = (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) });
export const updateProject  = (id, data) => request(`/projects?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProject  = (id) => request(`/projects?id=${id}`, { method: 'DELETE' });
export const createProjectInvoice = (id, data) => request(`/project-invoice?id=${id}`, { method: 'POST', body: JSON.stringify(data) });

// Project Items (subitems)

// Activities
export const getActivities  = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/activities${qs ? '?' + qs : ''}`);
};
export const createActivity = (data) => request('/activities', { method: 'POST', body: JSON.stringify(data) });
export const deleteActivity = (id) => request(`/activities?id=${id}`, { method: 'DELETE' });

// Invoices
export const getInvoices       = (deal_id) => request(`/invoices${deal_id ? '?deal_id=' + deal_id : ''}`);
export const createInvoice     = (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) });
export const refreshInvoice    = (id) => request(`/invoices?id=${id}&action=refresh`, { method: 'POST' });
export const voidInvoice       = (id) => request(`/invoices?id=${id}&action=void`, { method: 'POST' });
export const deleteInvoice     = (id) => request(`/invoices?id=${id}`, { method: 'DELETE' });

// Dashboard
export const getDashboardStats = () => request('/dashboard');

// Settings
export const getSettings         = () => request('/settings');
export const updateSetting       = (key, value) => request(`/settings?key=${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) });
export const bulkUpdateSettings  = (settings) => request('/settings?action=bulk', { method: 'POST', body: JSON.stringify({ settings }) });
export const getGmailStatus      = () => request('/settings?action=gmail-status');

// Gmail OAuth - will be updated in Phase 2
export const connectGmail    = () => { window.location.href = '/api/crm/auth-gmail'; };
export const disconnectGmail = () => request('/settings?action=disconnect-gmail', { method: 'POST' });

// Email Queue
export const getEmailQueue   = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/email-queue${qs ? '?' + qs : ''}`);
};
export const createQueueItem = (data) => request('/email-queue', { method: 'POST', body: JSON.stringify(data) });
export const updateQueueItem = (id, data) => request(`/email-queue?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteQueueItem = (id) => request(`/email-queue?id=${id}`, { method: 'DELETE' });
export const sendQueueItem   = (id) => request(`/email-queue?id=${id}&action=send`, { method: 'POST' });
export const draftQueueItem  = (id) => request(`/email-queue?id=${id}&action=draft`, { method: 'POST' });

// Gmail near-real-time label sync. Call with no id to get an initial anchor,
// then poll with the last historyId to receive changes since then.
export const gmailSync = (startHistoryId) =>
  request(`/gmail-sync${startHistoryId ? `?startHistoryId=${encodeURIComponent(startHistoryId)}` : ''}`);

// Batch label refresh, force-refetch labelIds for the given message IDs from Gmail.
// Used by the manual Refresh button so pre-existing labels applied outside our
// history window still make it into the CRM cache.
export const gmailRefreshLabels = (ids) => {
  if (!Array.isArray(ids) || !ids.length) return Promise.resolve({ changes: [], refreshed: 0 });
  return request(`/gmail-sync?ids=${encodeURIComponent(ids.join(','))}`);
};

// Upload a client-facing document (contract, brief, discovery notes, receipt, etc.).
// Server runs AI over extractable content and logs a summary as an activity note.
export const uploadClientDocument = async (client_id, file) => {
  const reader = new FileReader();
  const data_base64 = await new Promise((res, rej) => {
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  return request('/client-document', {
    method: 'POST',
    body: JSON.stringify({ client_id, filename: file.name, content_type: file.type, data_base64 }),
  });
};

// Attachment upload, turns a File into { url, name, mime, size } via Supabase Storage.
export const uploadEmailAttachment = async (client_id, file) => {
  const reader = new FileReader();
  const data_base64 = await new Promise((res, rej) => {
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
  return request('/email-upload-attachment', {
    method: 'POST',
    body: JSON.stringify({ client_id, filename: file.name, content_type: file.type, data_base64 }),
  });
};

// Email Generation
export const generateSingleEmail = (lead_id, focus, extra_context) =>
  request('/email-generate?action=single', { method: 'POST', body: JSON.stringify({ lead_id, focus, extra_context }) });
export const startBatchGenerate  = (mode, segment, lead_ids) =>
  request('/email-generate?action=batch', { method: 'POST', body: JSON.stringify({ mode, segment, lead_ids }) });
export const getBatchProgress    = (jobId) => request(`/email-generate?action=progress&jobId=${jobId}`);

// Communication Log
export const getCommLog        = (lead_id) => request(`/communication-log${lead_id ? '?lead_id=' + lead_id : ''}`);
export const markReplyReceived = (id) => request(`/communication-log?id=${id}&action=reply`, { method: 'PUT' });
export const createCommLog     = (data) => request('/communication-log', { method: 'POST', body: JSON.stringify(data) });

// Gmail Inbox
export const getGmailInbox = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/gmail-inbox${qs ? '?' + qs : ''}`);
};

// Gmail Thread
export const getGmailThread = (threadId) => request(`/gmail-thread?threadId=${encodeURIComponent(threadId)}`);

// Gmail Trash
export const trashGmailMessage = (messageId) => request('/gmail-trash', { method: 'POST', body: JSON.stringify({ messageId }) });

// AI Follow-ups
export const getAIFollowups = () => request('/ai-followups');
export const emailAgent = (data) => request('/email-agent', { method: 'POST', body: JSON.stringify(data) });

// Subscriptions
export const getSubscriptions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/subscriptions${qs ? '?' + qs : ''}`);
};
export const createSubscription = (data) => request('/subscriptions', { method: 'POST', body: JSON.stringify(data) });
export const updateSubscription = (id, data) => request(`/subscriptions?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSubscription = (id) => request(`/subscriptions?id=${id}`, { method: 'DELETE' });
export const scanSubscriptions = () => request('/subscriptions?action=scan', { method: 'POST' });

// Gmail labels, real Gmail labels, two-way synced (create here -> exists in
// Gmail; created in Gmail -> shows up here). Color is a CRM-only display
// preference stored against the real Gmail label id.
export const getGmailLabels = () => request('/gmail-labels');
export const createGmailLabel = (data) => request('/gmail-labels', { method: 'POST', body: JSON.stringify(data) });
export const deleteGmailLabel = (id) => request(`/gmail-labels?id=${id}`, { method: 'DELETE' });
export const applyGmailLabel = (message_id, label_id) =>
  request('/gmail-labels?action=apply', { method: 'POST', body: JSON.stringify({ message_id, label_id }) });
export const removeGmailLabel = (message_id, label_id) =>
  request('/gmail-labels?action=remove', { method: 'POST', body: JSON.stringify({ message_id, label_id }) });

// Portfolio
export const getPortfolio = () => request('/portfolio');
export const createPortfolioItem = (data) => request('/portfolio', { method: 'POST', body: JSON.stringify(data) });
export const updatePortfolioItem = (id, data) => request(`/portfolio?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePortfolioItem = (id) => request(`/portfolio?id=${id}`, { method: 'DELETE' });

// Gmail Contacts
export const getGmailContacts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/gmail-contacts${qs ? '?' + qs : ''}`);
};

// Email Labels (spam, favorite, follow-up, etc.)
export const getEmailLabels = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/email-labels${qs ? '?' + qs : ''}`);
};
export const addEmailLabel = (data) => request('/email-labels', { method: 'POST', body: JSON.stringify(data) });
export const removeEmailLabel = (gmail_message_id, label) =>
  request(`/email-labels?gmail_message_id=${encodeURIComponent(gmail_message_id)}&label=${encodeURIComponent(label)}`, { method: 'DELETE' });

// Meetings
export const getUpcomingMeetings      = ()             => request('/meetings?action=upcoming');
export const getPastMeetings          = ()             => request('/meetings?action=past');
export const createMeeting            = (data)         => request('/meetings?action=create', { method: 'POST', body: JSON.stringify(data) });
export const updateMeeting            = (id, data)     => request(`/meetings?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMeeting            = (id)           => request(`/meetings?id=${id}`, { method: 'DELETE' });
export const syncMeetings             = ()             => request('/meetings?action=sync', { method: 'POST' });
export const checkMeetingAvailability = (emails, s, e) =>
  request(`/meetings?action=check-availability&emails=${encodeURIComponent(emails.join(','))}&start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`);
export const getMeetingFreeSlots      = (date, duration) =>
  request(`/meetings?action=free-slots&date=${date}${duration ? `&duration=${duration}` : ''}`);
export const getMeetingLeadLinks      = ()             => request('/meetings?action=lead-links');
export const getMeetingStats          = ()             => request('/meetings?action=stats');
export const createMeetingLeadLink    = (data)         => request('/meetings?action=lead-link', { method: 'POST', body: JSON.stringify(data) });
export const deleteMeetingLeadLink    = (id)           => request(`/meetings?id=${id}&action=lead-link`, { method: 'DELETE' });
export const getMeetingDetail         = (eventId)      => request(`/meetings?id=${eventId}&action=detail`);
export const saveMeetingNotes         = (eventId, notes) => request(`/meetings?id=${eventId}&action=notes`, { method: 'PATCH', body: JSON.stringify({ notes }) });
export const findMeetingRecording     = (eventId)      => request(`/meetings?id=${eventId}&action=find-recording`, { method: 'POST' });
export const summarizeMeeting         = (eventId)      => request(`/meetings?id=${eventId}&action=summarize`, { method: 'POST' });
export const askMeetingSidekick       = (eventId, question, conversationHistory) =>
  request(`/meetings?id=${eventId}&action=ask`, { method: 'POST', body: JSON.stringify({ question, conversationHistory }) });
export const clearMeetingChat         = (eventId)      => request(`/meetings?id=${eventId}&action=chat`, { method: 'DELETE' });

// Global Search
export const searchAll = (q) => request(`/search?q=${encodeURIComponent(q)}`);

// Notifications
export const getNotifications      = ()       => request('/notifications');
export const dismissNotification   = (id)     => request('/notifications?action=dismiss', { method: 'POST', body: JSON.stringify({ id }) });
export const dismissAllNotifications = (ids)  => request('/notifications?action=dismiss', { method: 'POST', body: JSON.stringify({ dismissAll: true, ids }) });
export const resetDismissed        = ()       => request('/notifications?action=reset', { method: 'DELETE' });

// Quick Notes
export const getQuickNotes    = ()           => request('/quick-notes');
export const createQuickNote  = (data)       => request('/quick-notes', { method: 'POST', body: JSON.stringify(data) });
export const updateQuickNote  = (id, data)   => request(`/quick-notes?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteQuickNote  = (id)         => request(`/quick-notes?id=${id}`, { method: 'DELETE' });

// Blog Posts
export const getBlogPosts    = ()           => request('/blog-posts');
export const createBlogPost  = (data)       => request('/blog-posts', { method: 'POST', body: JSON.stringify(data) });
export const updateBlogPost  = (id, data)   => request(`/blog-posts?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBlogPost  = (id)         => request(`/blog-posts?id=${id}`, { method: 'DELETE' });

// Resources (public resources pages, grouped by category)
export const getResourceCategories   = ()         => request('/resource-categories');
export const createResourceCategory  = (data)     => request('/resource-categories', { method: 'POST', body: JSON.stringify(data) });
export const updateResourceCategory  = (id, data) => request(`/resource-categories?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteResourceCategory  = (id)       => request(`/resource-categories?id=${id}`, { method: 'DELETE' });

export const getResources    = (category)        => request(`/resources${category ? `?category=${encodeURIComponent(category)}` : ''}`);
export const createResource  = (data)            => request('/resources', { method: 'POST', body: JSON.stringify(data) });
export const updateResource  = (id, data)        => request(`/resources?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteResource  = (id)              => request(`/resources?id=${id}`, { method: 'DELETE' });

export async function uploadBlogMedia(file) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function uploadBlogFile(file) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': file.name,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}


// Email Marketing Clients (used for Add to Email List on Leads page)
export const getClients = () => request('/clients');
export const getClient = (id) => request(`/clients?id=${id}`);
export const createClient = (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id, data) => request(`/clients?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id) => request(`/clients?id=${id}`, { method: 'DELETE' });

// Client platforms / access tracking (which tools a client uses + access status)
export const getClientPlatforms   = (client_id) => request(`/client-platforms?client_id=${client_id}`);
export const createClientPlatform = (data)      => request('/client-platforms', { method: 'POST', body: JSON.stringify(data) });
export const updateClientPlatform = (id, data)  => request(`/client-platforms?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientPlatform = (id)        => request(`/client-platforms?id=${id}`, { method: 'DELETE' });

// Client onboarding / access checklist (portal to-dos the client checks off)
// Delivery board (kanban of clients in delivery)
export const getDeliveryBoard     = ()                 => request('/delivery-board?action=board');
export const moveDeliveryCard     = (id, delivery_stage) => request(`/delivery-board?action=move&id=${id}`, { method: 'PATCH', body: JSON.stringify({ delivery_stage }) });
export const setContentQuota      = (id, quota)        => request(`/delivery-board?action=quota&id=${id}`, { method: 'POST', body: JSON.stringify(quota) });
export const bumpContentProgress  = (id, kind, delta = 1) => request(`/delivery-board?action=progress&id=${id}`, { method: 'POST', body: JSON.stringify({ kind, delta }) });
export const generateSocialReport = (id)               => request(`/delivery-board?action=report&id=${id}`, { method: 'POST' });

export const getClientTasks   = (client_id) => request(`/client-tasks?client_id=${client_id}`);
export const createClientTask = (data)      => request('/client-tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateClientTask = (id, data)  => request(`/client-tasks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientTask = (id)        => request(`/client-tasks?id=${id}`, { method: 'DELETE' });

// MailerLite email blast (regular campaign) to a group
export const getCampaignDefaults = (client_id) => request(`/mailerlite-campaign?client_id=${client_id}`);
export const sendMailerliteCampaign = (data)   => request('/mailerlite-campaign', { method: 'POST', body: JSON.stringify(data) });
export const deleteMailerliteCampaign = (client_id, campaign_id) =>
  request(`/mailerlite-campaign?client_id=${client_id}&campaign_id=${campaign_id}`, { method: 'DELETE' });
export const rescheduleMailerliteCampaign = (data) =>
  request('/mailerlite-campaign', { method: 'PUT', body: JSON.stringify(data) });

// Recurring email-blast automations (weekly, by weekday + time)
export const getEmailAutomations   = (client_id) => request(`/email-automations?client_id=${client_id}`);
export const createEmailAutomation = (data)      => request('/email-automations', { method: 'POST', body: JSON.stringify(data) });
export const updateEmailAutomation = (id, data)  => request(`/email-automations?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmailAutomation = (id)        => request(`/email-automations?id=${id}`, { method: 'DELETE' });

// Walkthroughs / SOPs (multi-step guides with links + media)
export const getWalkthroughs  = ()        => request('/walkthroughs');
export const getWalkthrough   = (id)      => request(`/walkthroughs?id=${id}`);
export const createWalkthrough = (data)   => request('/walkthroughs', { method: 'POST', body: JSON.stringify(data) });
export const updateWalkthrough = (id, d)  => request(`/walkthroughs?id=${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const deleteWalkthrough = (id)     => request(`/walkthroughs?id=${id}`, { method: 'DELETE' });

// Upload a raw file (image / video / pdf / doc) to storage; returns { url }.
export async function uploadFile(file) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': file.name || 'file',
    },
    body: file,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
  return res.json();
}

// Recurring checklists / routines (daily / weekly / monthly, auto-reset)
export const getRoutines   = ()        => request('/routines');
export const createRoutine = (data)    => request('/routines', { method: 'POST', body: JSON.stringify(data) });
export const updateRoutine = (id, d)   => request(`/routines?id=${id}`, { method: 'PUT', body: JSON.stringify(d) });
export const deleteRoutine = (id)      => request(`/routines?id=${id}`, { method: 'DELETE' });
export const checkRoutineItem = (data) => request('/routines?action=check', { method: 'POST', body: JSON.stringify(data) });

// Shared team to-do list (everyone sees + adds; open vs. locked-to-a-user)
export const getTodos       = ()        => request('/team-todos');
export const getTodoMembers = ()        => request('/team-todos?members=1');
export const setTodoSharing = (user_id, shared) => request('/team-todos?action=share', { method: 'POST', body: JSON.stringify({ user_id, shared }) });
export const createTodo     = (data)    => request('/team-todos', { method: 'POST', body: JSON.stringify(data) });
export const updateTodo     = (id, data)=> request(`/team-todos?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodo     = (id)      => request(`/team-todos?id=${id}`, { method: 'DELETE' });

// Client activity (notes / calls / tasks)
export const getClientActivity    = (client_id, type) => request(`/client-activity?client_id=${client_id}${type ? '&type=' + type : ''}`);
export const generateClientSummary = (data) => request('/client-summary', { method: 'POST', body: JSON.stringify(data) });
export const createClientActivity = (data)      => request('/client-activity', { method: 'POST', body: JSON.stringify(data) });
export const updateClientActivity = (id, data)  => request(`/client-activity?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientActivity = (id)        => request(`/client-activity?id=${id}`, { method: 'DELETE' });

// Client credential vault (secrets encrypted at rest; decrypted server-side)
export const getClientCredentials   = (client_id) => request(`/client-credentials?client_id=${client_id}`);
export const createClientCredential = (data)      => request('/client-credentials', { method: 'POST', body: JSON.stringify(data) });
export const updateClientCredential = (id, data)  => request(`/client-credentials?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientCredential = (id)        => request(`/client-credentials?id=${id}`, { method: 'DELETE' });

// Client portal alerts (client completed a task, etc.)
export const getClientAlerts   = (unread) => request(`/client-alerts${unread ? '?unread=1' : ''}`);
export const markAlertRead     = (id)     => request(`/client-alerts?id=${id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
export const markAllAlertsRead = ()       => request('/client-alerts?action=read-all', { method: 'POST' });

// Agreements + payment schedule
export const getAgreements       = (client_id) => request(`/agreements?client_id=${client_id}`);
export const getAgreementFileUrl = (id)        => request(`/agreements?id=${id}&action=file`, { method: 'POST' });
export const approveAgreementRow = (id)        => request(`/agreements?id=${id}&action=approve`, { method: 'POST' });
export const previewAgreementToken = (id)      => request(`/agreements?id=${id}&action=preview-token`, { method: 'POST' });
export const sendAgreementForSignature = (id)  => request(`/agreements?id=${id}&action=send`, { method: 'POST' });
export const updatePayment       = (id, status) => request(`/agreements?id=${id}&action=payment`, { method: 'PATCH', body: JSON.stringify({ status }) });
// AI agreement builder
export const agreementChat    = (client_id, messages) => request('/agreement-ai?action=chat', { method: 'POST', body: JSON.stringify({ client_id, messages }) });
export const analyzeDeal      = (client_id)        => request('/agreement-ai?action=analyze', { method: 'POST', body: JSON.stringify({ client_id }) });
export const generateAgreement = (client_id, terms, base, mode) => request('/agreement-ai?action=generate', { method: 'POST', body: JSON.stringify({ client_id, terms, base, mode }) });
export const suggestProjects   = (client_id) => request('/agreement-ai?action=suggest-projects', { method: 'POST', body: JSON.stringify({ client_id }) });
export const generateAccessInstructions = (title, notes) => request('/agreement-ai?action=access-instructions', { method: 'POST', body: JSON.stringify({ title, notes }) });
export const draftClientEmail = (client_id, tone, portal_url, sign_url) => request('/agreement-ai?action=client-email', { method: 'POST', body: JSON.stringify({ client_id, tone, portal_url, sign_url }) });
export const sendClientEmail  = (payload) => request('/client-email', { method: 'POST', body: JSON.stringify(payload) });
export const setAgreementPlans = (id, plan_options) => request(`/agreements?id=${id}&action=set-plans`, { method: 'POST', body: JSON.stringify({ plan_options }) });
export const setupCustomAgreement = (client_id, data) => request(`/agreements?action=custom-setup`, { method: 'POST', body: JSON.stringify({ client_id, ...data }) });
export const markAgreementSent = (id) => request(`/agreements?id=${id}&action=mark-sent`, { method: 'POST' });
export const startMaintenance  = (id) => request(`/agreements?id=${id}&action=start-maintenance`, { method: 'POST' });
export const approveAgreement  = (client_id, draft) => request('/agreement-ai?action=approve', { method: 'POST', body: JSON.stringify({ client_id, draft }) });
export const saveAgreementDoc  = (client_id, doc) => request('/agreement-ai?action=save-doc', { method: 'POST', body: JSON.stringify({ client_id, ...doc }) });

// Content Clients
export const getContentClients = () => request('/content-clients');
export const getContentClient = (id) => request(`/content-clients?id=${id}`);
export const createContentClient = (data) => request('/content-clients', { method: 'POST', body: JSON.stringify(data) });
export const updateContentClient = (id, data) => request(`/content-clients?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteContentClient = (id) => request(`/content-clients?id=${id}`, { method: 'DELETE' });

// Content Scheduler
export const getContentScripts = (clientId) => request(`/content-scripts?client_id=${clientId}`);
export const createContentScript = (data) => request('/content-scripts', { method: 'POST', body: JSON.stringify(data) });
export const updateContentScript = (id, data) => request(`/content-scripts?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteContentScript = (id) => request(`/content-scripts?id=${id}`, { method: 'DELETE' });
export const clearContentScripts = (clientId) => request(`/content-scripts?client_id=${clientId}&action=clear-all`, { method: 'DELETE' });

export const getSocialAccounts = (clientId) => request(`/social-accounts?client_id=${clientId}`);
export const createSocialAccount = (data) => request('/social-accounts', { method: 'POST', body: JSON.stringify(data) });
export const updateSocialAccount = (id, data) => request(`/social-accounts?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSocialAccount = (id) => request(`/social-accounts?id=${id}`, { method: 'DELETE' });

export const getScheduleConfig = (clientId) => request(`/schedule-config?client_id=${clientId}`);
export const saveScheduleConfig = (data) => request('/schedule-config', { method: 'POST', body: JSON.stringify(data) });

export const parseScripts = (data) => request('/content-ai?action=parse-scripts', { method: 'POST', body: JSON.stringify(data) });
export const generateCaptions = (data) => request('/content-ai?action=generate-captions', { method: 'POST', body: JSON.stringify(data) });
export const autoScheduleContent = (data) => request('/content-ai?action=auto-schedule', { method: 'POST', body: JSON.stringify(data) });
export const processBrandBible = (data) => request('/process-brand-bible', { method: 'POST', body: JSON.stringify(data) });
export const generateContent = (data) => request('/content-ai?action=generate-content', { method: 'POST', body: JSON.stringify(data) });
export const editPosts = (data) => request('/content-ai?action=edit-posts', { method: 'POST', body: JSON.stringify(data) });
export const editClient = (data) => request('/content-ai?action=edit-client', { method: 'POST', body: JSON.stringify(data) });
export const processBulkUpload = (data) => request('/bulk-upload', { method: 'POST', body: JSON.stringify(data) });
export const generateCarousel = (data) => request('/carousel-generator', { method: 'POST', body: JSON.stringify(data) });
export const regenerateSlide = (data) => request('/carousel-generator?action=regenerate', { method: 'POST', body: JSON.stringify(data) });
export const editSlide = (data) => request('/carousel-generator?action=edit', { method: 'POST', body: JSON.stringify(data) });
export const saveCarouselTemplates = (data) => request('/carousel-generator?action=save-templates', { method: 'POST', body: JSON.stringify(data) });
export const runBulkAgent = (data) => request('/bulk-agent', { method: 'POST', body: JSON.stringify(data) });
export const approveAndSchedule = (data) => request('/content-ai?action=approve-and-schedule', { method: 'POST', body: JSON.stringify(data) });


// ══════════════════════════════════════════════════════════════
// ══ EMAIL MARKETING ══
// ══════════════════════════════════════════════════════════════

// Config
export const getEmailConfig = (clientId) => request(`/email-config?client_id=${clientId}`);
export const saveEmailConfig = (data) => request('/email-config', { method: 'POST', body: JSON.stringify(data) });
export const testMailerliteKey = (api_key) => request('/email-config?action=test-mailerlite', { method: 'POST', body: JSON.stringify({ api_key }) });
export const runMailerliteBackfill = (client_id, opts = {}) => request('/mailerlite-backfill', { method: 'POST', body: JSON.stringify({ client_id, ...opts }) });
export const refreshCampaignStats = (campaign_id) => request('/email-campaigns?action=refresh-stats', { method: 'POST', body: JSON.stringify({ campaign_id }) });
export const cancelCampaign = (campaign_id) => request('/email-campaigns?action=cancel', { method: 'POST', body: JSON.stringify({ campaign_id }) });

// Contacts
export const getEmailContacts = (clientId, tag) => request(`/email-contacts?client_id=${clientId}${tag ? '&tag=' + encodeURIComponent(tag) : ''}`);
export const addEmailContacts = (data) => request('/email-contacts', { method: 'POST', body: JSON.stringify(data) });
export const updateContactTags = (data) => request('/email-contacts?action=update-tags', { method: 'POST', body: JSON.stringify(data) });
export const deleteEmailContact = (id) => request(`/email-contacts?id=${id}`, { method: 'DELETE' });
export const updateEmailContact = (data) => request('/email-contacts?action=update-contact', { method: 'POST', body: JSON.stringify(data) });

// Templates
export const getEmailTemplates = (clientId, type) => request(`/email-templates?client_id=${clientId}${type ? '&template_type=' + type : ''}`);
export const createEmailTemplate = (data) => request('/email-templates', { method: 'POST', body: JSON.stringify(data) });
export const updateEmailTemplate = (id, data) => request(`/email-templates?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmailTemplate = (id) => request(`/email-templates?id=${id}`, { method: 'DELETE' });

// Campaigns
export const getEmailCampaigns = (clientId) => request(`/email-campaigns?client_id=${clientId}`);
export const createEmailCampaign = (data) => request('/email-campaigns?action=create', { method: 'POST', body: JSON.stringify(data) });
export const sendEmailCampaign = (data) => request('/email-campaigns?action=send', { method: 'POST', body: JSON.stringify(data) });
export const scheduleEmailCampaign = (data) => request('/email-campaigns?action=schedule', { method: 'POST', body: JSON.stringify(data) });
export const updateEmailCampaign = (id, data) => request(`/email-campaigns?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteEmailCampaign = (id) => request(`/email-campaigns?id=${id}`, { method: 'DELETE' });

// Tag context (descriptions per tag for AI)
export const getTagContexts = (clientId) => request(`/email-tag-context?client_id=${clientId}`);
export const saveTagContext = (data) => request('/email-tag-context', { method: 'POST', body: JSON.stringify(data) });
export const deleteTagContext = (id) => request(`/email-tag-context?id=${id}`, { method: 'DELETE' });

// Contact stats
export const getContactStats = (clientId) => request(`/email-stats?action=contact-stats&client_id=${clientId}`);
export const getContactSends = (contactId) => request(`/email-stats?action=contact-sends&contact_id=${contactId}`);

// Email image upload (returns { url, key })
export const uploadEmailImage = (data) => request('/email-upload-image', { method: 'POST', body: JSON.stringify(data) });

// Client logo upload, also persists logo_url on crm_content_clients
export const uploadClientLogo = (data) => request('/client-logo-upload', { method: 'POST', body: JSON.stringify(data) });

// AI-generate an email template using the client's brand bible + logo + colors
export const generateEmailTemplateAI = (data) => request('/email-template-ai', { method: 'POST', body: JSON.stringify(data) });

// AI edit pass over existing HTML, body: { client_id, html, instruction, selection? }
// editEmailAI streams progress via SSE from /email-edit-ai.
// Signature: editEmailAI(data, { onProgress } = {}) -> Promise<{ html, message, mode }>
// onProgress receives { phase, mode?, model?, chars? } events so the UI can
// show live feedback while the AI writes.
export const editEmailAI = async (data, { onProgress } = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 110000);
  try {
    const res = await fetch(`${BASE}/email-edit-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
    }
    const ct = res.headers.get('content-type') || '';
    // Fallback for non-streaming response
    if (!ct.includes('text/event-stream')) {
      return await res.json();
    }
    if (!res.body || !res.body.getReader) throw new Error('Streaming not supported in this browser');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;
    let streamError = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (chunk.startsWith(':')) continue; // keepalive
        const lines = chunk.split('\n');
        let event = 'message', dataStr = '';
        for (const l of lines) {
          if (l.startsWith('event: ')) event = l.slice(7).trim();
          else if (l.startsWith('data: ')) dataStr += l.slice(6);
        }
        if (!dataStr) continue;
        let payload;
        try { payload = JSON.parse(dataStr); } catch { continue; }
        if (event === 'progress') onProgress?.(payload);
        else if (event === 'done') finalResult = payload;
        else if (event === 'error') streamError = payload.error || 'stream error';
      }
    }
    if (streamError) throw new Error(streamError);
    if (!finalResult) throw new Error('Stream ended without a result');
    return finalResult;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('AI request timed out after 110s. Try a shorter instruction or split into smaller edits.');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

// MailerLite groups for a client (for broadcast audience picker)
export const getMailerliteGroups = (client_id) => request(`/mailerlite-groups?client_id=${client_id}`);
export const createMailerliteGroup = (client_id, name) => request('/mailerlite-groups', { method: 'POST', body: JSON.stringify({ client_id, name }) });
// Live MailerLite subscribers (marketing audience), optionally filtered by group
export const getMailerliteSubscribers = (client_id, group_id) =>
  request(`/mailerlite-subscribers?client_id=${client_id}${group_id ? `&group_id=${group_id}` : ''}`);
export const updateMailerliteSubscriber = (data) =>
  request('/mailerlite-subscribers', { method: 'PUT', body: JSON.stringify(data) });

// ══════════════════════════════════════════════════════════════
// ══ ACADEMY ADMIN API ══
// ══════════════════════════════════════════════════════════════

const ACADEMY = '/api/academy';

async function academyRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${ACADEMY}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Dashboard
export const getAcademyStats = () => academyRequest('/admin-dashboard');

// Courses
export const getAcademyCourses = () => academyRequest('/admin-courses');
export const createAcademyCourse = (data) => academyRequest('/admin-courses', { method: 'POST', body: JSON.stringify(data) });
export const updateAcademyCourse = (id, data) => academyRequest(`/admin-courses?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAcademyCourse = (id) => academyRequest(`/admin-courses?id=${id}`, { method: 'DELETE' });

// Lessons
export const getAcademyLessons = (courseId) => academyRequest(`/admin-lessons?course_id=${courseId}`);
export const createAcademyLesson = (data) => academyRequest('/admin-lessons', { method: 'POST', body: JSON.stringify(data) });
export const updateAcademyLesson = (id, data) => academyRequest(`/admin-lessons?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAcademyLesson = (id) => academyRequest(`/admin-lessons?id=${id}`, { method: 'DELETE' });

// Students
export const getAcademyStudents = () => academyRequest('/admin-students');
export const getAcademyStudent = (id) => academyRequest(`/admin-students?id=${id}`);

// Homework
export const getAcademyHomework = (status) => academyRequest(`/admin-homework${status ? '?status=' + status : ''}`);
export const updateAcademyHomework = (id, data) => academyRequest(`/admin-homework?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Messages
export const getAcademyThreads = () => academyRequest('/admin-messages');
export const getAcademyThread = (userId) => academyRequest(`/admin-messages?student_id=${userId}`);
export const sendAcademyMessage = (data) => academyRequest('/admin-messages', { method: 'POST', body: JSON.stringify(data) });

// Community
export const getAcademyCommunityPosts = () => academyRequest('/admin-community');
export const deleteAcademyPost = (id) => academyRequest(`/admin-community?id=${id}`, { method: 'DELETE' });
export const pinAcademyPost = (id) => academyRequest(`/admin-community?id=${id}&action=pin`, { method: 'PUT' });

// Recommendations
export const getAcademyRecommendations = () => academyRequest('/admin-recommendations');
export const createAcademyRecommendation = (data) => academyRequest('/admin-recommendations', { method: 'POST', body: JSON.stringify(data) });
export const updateAcademyRecommendation = (id, data) => academyRequest(`/admin-recommendations?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAcademyRecommendation = (id) => academyRequest(`/admin-recommendations?id=${id}`, { method: 'DELETE' });

// Settings
export const getAcademySettings = () => academyRequest('/admin-settings');
export const updateAcademySetting = (key, value) => academyRequest(`/admin-settings?key=${key}`, { method: 'PUT', body: JSON.stringify({ value }) });

// AI Generation
export const generateAcademyContent = (data) => academyRequest('/ai-generate', { method: 'POST', body: JSON.stringify(data) });

// Single lesson (with content items)
export const getAcademyLesson = (id) => academyRequest(`/admin-lessons?id=${id}`);

// Upload file to storage (uses signed URL, uploads directly to Supabase)
export async function uploadAcademyFile(bucket, path, file, contentType) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Step 1: Get a signed upload URL from our API
  const signRes = await fetch(
    `${ACADEMY}/upload?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get upload URL');
  }
  const { uploadUrl, publicUrl } = await signRes.json();

  // Step 2: Upload the file directly to Supabase Storage (no size limit from serverless)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || file.type || 'application/octet-stream' },
    body: file,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload failed: ${errText}`);
  }

  return { url: publicUrl, bucket, path };
}

// Lesson content items (media)
export const createLessonContent = (data) => academyRequest('/admin-lessons?action=add-content', { method: 'POST', body: JSON.stringify(data) });
export const deleteLessonContent = (id) => academyRequest(`/admin-lessons?action=delete-content&content_id=${id}`, { method: 'DELETE' });

// Transcribe video/audio and auto-generate description
export const transcribeLessonMedia = (contentId, lessonId) => academyRequest('/transcribe', { method: 'POST', body: JSON.stringify({ content_id: contentId, lesson_id: lessonId }) });

// Lead Recordings
export const getLeadRecordings      = (leadId) => request(`/recordings?lead_id=${leadId}`);
export const getLeadRecordingCounts    = ()    => request(`/recordings?action=counts`);
export const getRecordingStats         = ()    => request(`/recordings?action=stats`);
export const getProcessingRecordings   = ()    => request(`/recordings?action=processing`);
export const deleteRecording        = (id)     => request(`/recordings?id=${id}`, { method: 'DELETE' });


// ─── Upload-Post API ──────────────────────────────────────────────────────────
export const getUploadPostProfiles       = ()           => request('/uploadpost?action=profiles');
export const publishToSocial             = (data)       => request('/uploadpost?action=publish', { method: 'POST', body: JSON.stringify(data) });
export const getUploadPostStatus         = (request_id) => request(`/uploadpost?action=status&request_id=${request_id}`);
// Instagram Comments
export const getIGComments               = (user, post_url) => request(`/uploadpost?action=comments&user=${encodeURIComponent(user)}&post_url=${encodeURIComponent(post_url)}`);
export const replyIGComment              = (data)       => request('/uploadpost?action=comments-reply', { method: 'POST', body: JSON.stringify(data) });
export const publicReplyIGComment        = (data)       => request('/uploadpost?action=comments-public-reply', { method: 'POST', body: JSON.stringify(data) });
// Instagram DMs
export const sendIGDM                    = (data)       => request('/uploadpost?action=dm-send', { method: 'POST', body: JSON.stringify(data) });
export const getIGConversations          = (user)       => request(`/uploadpost?action=dm-conversations&user=${encodeURIComponent(user)}`);
// AutoDM Monitors
export const startAutoDM                 = (data)       => request('/uploadpost?action=autodm-start', { method: 'POST', body: JSON.stringify(data) });
export const getAutoDMStatus             = ()           => request('/uploadpost?action=autodm-status');
export const getAutoDMLogs               = (monitor_id) => request(`/uploadpost?action=autodm-logs&monitor_id=${monitor_id}`);
export const pauseAutoDM                 = (monitor_id) => request('/uploadpost?action=autodm-pause', { method: 'POST', body: JSON.stringify({ monitor_id }) });
export const resumeAutoDM                = (monitor_id) => request('/uploadpost?action=autodm-resume', { method: 'POST', body: JSON.stringify({ monitor_id }) });
export const stopAutoDM                  = (monitor_id) => request('/uploadpost?action=autodm-stop', { method: 'POST', body: JSON.stringify({ monitor_id }) });
export const deleteAutoDM                = (monitor_id) => request('/uploadpost?action=autodm-delete', { method: 'POST', body: JSON.stringify({ monitor_id }) });
// Analytics
export const getUploadPostAnalytics      = (user, platforms, period) => request(`/uploadpost?action=analytics&user=${encodeURIComponent(user)}&platforms=${platforms || 'instagram,tiktok'}&period=${period || 'last_month'}`);
export const getTotalImpressions         = (user, period) => request(`/uploadpost?action=total-impressions&user=${encodeURIComponent(user)}&period=${period || 'last_month'}&breakdown=true`);
export const getPostAnalytics            = (request_id)  => request(`/uploadpost?action=post-analytics&request_id=${request_id}`);
export const getRecentPosts               = (user, platform = 'tiktok', limit = 10) => request(`/uploadpost?action=recent-posts&user=${encodeURIComponent(user)}&platform=${platform}&limit=${limit}`);
export const saveAnalyticsSnapshot       = (data)        => request('/uploadpost?action=save-analytics', { method: 'POST', body: JSON.stringify(data) });
export const getAnalyticsHistory         = (client_id, period, platforms) => request(`/uploadpost?action=analytics-history&client_id=${client_id}${period ? `&period=${period}` : ''}${platforms ? `&platforms=${encodeURIComponent(platforms)}` : ''}`);
export const getMonitors                 = (client_id)   => request(`/uploadpost?action=get-monitors&client_id=${client_id}`);
export const startMonitor                = (data)        => request('/uploadpost?action=start-monitor', { method: 'POST', body: JSON.stringify(data) });
export const stopMonitor                 = (data)        => request('/uploadpost?action=stop-monitor', { method: 'POST', body: JSON.stringify(data) });

// Team & Access, retired. Use the admin-users helpers instead
// (getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
// upsertUserGrant, revokeUserGrant).

// Training
export const getTrainingVideos    = ()            => request('/training');
export const getTrainingUploadUrl = (filename)    => request('/training?action=upload-url', { method: 'POST', body: JSON.stringify({ filename }) });
export const createTrainingVideo  = (data)        => request('/training?action=create', { method: 'POST', body: JSON.stringify(data) });
export const updateTrainingVideo  = (id, data)    => request(`/training?id=${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteTrainingVideo  = (id)          => request(`/training?id=${id}`, { method: 'DELETE' });
export const saveTrainingProgress = (data)        => request('/training?action=progress', { method: 'POST', body: JSON.stringify(data) });

// Call Scripts
export const getScripts         = ()             => request('/scripts');
export const createScript       = (data)         => request('/scripts', { method: 'POST', body: JSON.stringify(data) });
export const updateScript       = (id, data)     => request(`/scripts?id=${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteScript       = (id)           => request(`/scripts?id=${id}`, { method: 'DELETE' });
export const personalizeScript  = (script, lead) => request('/personalize-script', { method: 'POST', body: JSON.stringify({ script, lead }) });

// Avatars
export const getAvatars      = ()           => request('/avatars');
export const getAvatar       = (id)         => request(`/avatars?id=${id}`);
export const createAvatar    = (data)       => request('/avatars', { method: 'POST', body: JSON.stringify(data) });
export const updateAvatar    = (id, data)   => request(`/avatars?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAvatar    = (id)         => request(`/avatars?id=${id}`, { method: 'DELETE' });

// Avatar Outfits
export const getOutfits      = (avatar_id)  => request(`/avatar-outfits?avatar_id=${avatar_id}`);
export const createOutfit    = (data)       => request('/avatar-outfits', { method: 'POST', body: JSON.stringify(data) });
export const updateOutfit    = (id, data)   => request(`/avatar-outfits?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteOutfit    = (id)         => request(`/avatar-outfits?id=${id}`, { method: 'DELETE' });

// Avatar Looks
export const getLooks        = (avatar_id, outfit_id = null) => {
  const q = new URLSearchParams({ avatar_id });
  if (outfit_id != null) q.set('outfit_id', outfit_id);
  return request(`/avatar-looks?${q.toString()}`);
};
export const createLook      = (data)       => request('/avatar-looks', { method: 'POST', body: JSON.stringify(data) });
export const updateLook      = (id, data)   => request(`/avatar-looks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLook      = (id)         => request(`/avatar-looks?id=${id}`, { method: 'DELETE' });
export const bulkAssignLooks = (ids, outfit_id) => request('/avatar-looks?action=bulk-assign', { method: 'PUT', body: JSON.stringify({ ids, outfit_id }) });

// HeyGen import
export const getHeyGenGroups = ()           => request('/avatar-heygen?action=groups');
export const getHeyGenLooks  = (group_id)   => request(`/avatar-heygen?action=looks&group_id=${encodeURIComponent(group_id)}`);
export const importFromHeyGen = (data)      => request('/avatar-heygen?action=import', { method: 'POST', body: JSON.stringify(data) });
export const refreshHeyGenLooks = (avatar_id) => request('/avatar-heygen?action=refresh-looks', { method: 'POST', body: JSON.stringify({ avatar_id }) });

// Avatar Renders
export const getRenders      = (avatar_id) => request(`/avatar-renders${avatar_id ? `?avatar_id=${avatar_id}` : ''}`);
export const getRender       = (id)         => request(`/avatar-renders?id=${id}`);
export const createRender    = (data)       => request('/avatar-renders', { method: 'POST', body: JSON.stringify(data) });
export const updateRender    = (id, data)   => request(`/avatar-renders?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRender    = (id)         => request(`/avatar-renders?id=${id}`, { method: 'DELETE' });
export const scheduleRender  = (id, data)   => request(`/avatar-renders?id=${id}&action=schedule`, { method: 'POST', body: JSON.stringify(data) });
export const suggestTitle    = (script)     => request('/avatar-renders?action=suggest-title', { method: 'POST', body: JSON.stringify({ script }) });

// Claude Code workspaces available to link to a project. Published from a local
// machine by tools/claude-sync.mjs; the server cannot enumerate them itself.
export const getClaudeWorkspaces = () => request('/claude-workspaces');

// ══════════════════════════════════════════════════════════════
// ══ ROLE HOMES, MONEY, NUDGES, AGREEMENTS ══
// Shapes in docs/engineer/role-homes-contracts.md. The iPhone app calls the
// same endpoints, so keep these in step with mobile/lib/api.js.
// ══════════════════════════════════════════════════════════════

// One call per home load: { role, me, next_up, held_up, money, ... }. Answers
// 503 with needs_migration when docs/sql/role-homes.sql has not been run.
export const getHome = (role) => request(`/home${role ? `?role=${encodeURIComponent(role)}` : ''}`);

// Nudges: draft (target + channels + template message), send, history.
// kind is 'invoice' | 'manual_invoice' | 'payment' | 'agreement' | 'plan'.
export const draftNudge = ({ kind, id }) => request('/nudges?action=draft', { method: 'POST', body: JSON.stringify({ kind, id }) });
// data: { kind, id, channels: ['text','email'], message, email_subject?, schedule_at? }
// Reply: { ok, sent: [...], skipped: [...], nudge_id }
export const sendNudge = (data) => request('/nudges', { method: 'POST', body: JSON.stringify(data) });
export const getNudges = (kind, id) => request(`/nudges?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
// getClientActivity(client_id) is defined above (Client activity section) and
// already calls GET /client-activity?client_id=, the same URL the contract uses.

// Same endpoint, merged view for the client page's Overview tab:
// { client, files[], activity[], next_up, balance, plan }. Kept separate from
// getClientActivity so the raw Activity list keeps its own call and shape.
export const getClientOverview = (client_id) =>
  request(`/client-activity?client_id=${encodeURIComponent(client_id)}&view=overview`);

// Count-to-target routine items: upserts crm_routine_checks.done_count (read back as count) for the
// period; the row counts as done once count >= item.target.
export const countRoutineItem = ({ routine_id, item_id, period_key, count }) =>
  request('/routines?action=count', { method: 'POST', body: JSON.stringify({ routine_id, item_id, period_key, count }) });

// Queue an iMessage with the agreement's sign link. Reply: { ok, phone }.
export const textSignLink = (id) => request(`/agreements?action=text-sign-link&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });

// App usage rollup (admins): { days, rows: [{ user_id, user_name, event, name, day, n }] }
export const getAppEvents = (days) => request(`/app-events${days ? `?days=${encodeURIComponent(days)}` : ''}`);

// Which home layout each person gets in the app: settings key home_roles, a
// JSON map of auth user id to 'ceo' | 'hr' | 'assistant' | 'sales' | 'general'.
// A missing entry means "auto" (the server resolves it from admin flag + roster).
export const getHomeRoles = () => getSettings().then(rows => {
  let raw;
  if (Array.isArray(rows)) raw = rows.find(r => r.key === 'home_roles')?.value;
  else if (rows && typeof rows === 'object') raw = rows.home_roles ?? (rows.settings || rows.rows || []).find?.(r => r.key === 'home_roles')?.value;
  try {
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
});
export const setHomeRoles = (map) => bulkUpdateSettings([{ key: 'home_roles', value: JSON.stringify(map || {}) }]);

// Access roles: page and information sets an admin defines once, then puts
// people in. Stored as one settings key so there is no new table.
export const getAccessRoles = () => request('/settings?key=access_roles').then(row => {
  const raw = row && typeof row === 'object' ? row.value : null;
  try {
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}).catch(() => ({}));
export const setAccessRoles = (map) => bulkUpdateSettings([{ key: 'access_roles', value: JSON.stringify(map || {}) }]);

// Every event, not just the 50 most recent past ones: a calendar pages back
// through months and an empty grid is worse than a slow one.
export const getAllMeetings = () => request('/meetings');

// ── Team chat (internal: direct messages and group chats) ──────────────────
// Lives beside the customer inbox and never touches it. When the tables are
// not migrated yet the GETs answer with needs_migration instead of data, and
// the POSTs answer 503 with needs_migration on the thrown error.
// rooms: { rooms: [{ id, kind, name, members:[{user_id,user_name,role}], unread,
//          last_message_at, last_message_preview, last_sender_name }], needs_migration? }
export const getChatRooms      = () => request('/chat?action=rooms');
// people: { people: [{ id, name, email, is_admin, on_app }] }. on_app means
// they are signed into the phone app, so they can actually get the messages.
export const getChatPeople     = () => request('/chat?action=people');
// after is an ISO timestamp: only messages newer than it come back.
export const getChatMessages   = (room, after) =>
  request(`/chat?action=messages&room=${encodeURIComponent(room)}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
// data: { kind: 'dm' | 'group', name?, member_ids: [] }. Reply: { room, existing }.
export const createChat        = (data) => request('/chat?action=create', { method: 'POST', body: JSON.stringify(data) });
export const sendChat          = (room, body) => request('/chat?action=send', { method: 'POST', body: JSON.stringify({ room, body }) });
export const renameChat        = (room, name) => request('/chat?action=rename', { method: 'POST', body: JSON.stringify({ room, name }) });
export const changeChatMembers = (room, add, remove) =>
  request('/chat?action=members', { method: 'POST', body: JSON.stringify({ room, add: add || [], remove: remove || [] }) });
export const markChatRead      = (room) => request('/chat?action=read', { method: 'POST', body: JSON.stringify({ room }) });
export const leaveChat         = (room) => request('/chat?action=leave', { method: 'POST', body: JSON.stringify({ room }) });

// ── iMessage media ─────────────────────────────────────────────────────────
// Ask for a signed spot in storage, PUT the bytes there, then send the message
// with attachments: [{ url, type, name, mime, size, width, height }].
export const getImsgUploadUrl = (name) => request('/imessage?action=upload-url', { method: 'POST', body: JSON.stringify({ name }) });

// Uploads one browser File to the signed URL. onProgress gets 0 to 100 while
// the bytes go up (XHR, because fetch cannot report upload progress).
export function putUpload(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve(true)
      : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(file);
  });
}

// One call from a picked File to the attachment record the send takes.
export async function uploadImsgFile(file, onProgress) {
  const name = file.name || `upload-${Date.now()}`;
  const { uploadUrl, publicUrl } = await getImsgUploadUrl(name);
  await putUpload(uploadUrl, file, onProgress);
  const mime = file.type || '';
  return {
    url: publicUrl,
    type: /^video\//.test(mime) ? 'video' : /^image\//.test(mime) ? 'image' : /^audio\//.test(mime) ? 'audio' : 'file',
    name,
    mime,
    size: file.size || null,
  };
}
