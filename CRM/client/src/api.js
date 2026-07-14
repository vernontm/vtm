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
    throw new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Current user + accessible clients (multi-tenant bootstrap)
export const getMe = () => request('/me');

// Admin: user management
export const getAdminUsers    = () => request('/admin-users');
export const createAdminUser  = (data) => request('/admin-users', { method: 'POST', body: JSON.stringify(data) });
export const updateAdminUser  = (id, data) => request(`/admin-users?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAdminUser  = (id) => request(`/admin-users?id=${id}`, { method: 'DELETE' });
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

// Deals — the billable container: one agreement + one combined invoice,
// grouping a client's projects. Pass a crm_clients.id to scope to that client.
export const getDeals    = (clientId) => request(`/deals${clientId ? `?client_id=${clientId}` : ''}`);
export const createDeal  = (data) => request('/deals', { method: 'POST', body: JSON.stringify(data) });
export const updateDeal  = (id, data) => request(`/deals?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDeal  = (id) => request(`/deals?id=${id}`, { method: 'DELETE' });
export const createDealInvoice = (id, data) => request(`/deal-invoice?id=${id}`, { method: 'POST', body: JSON.stringify(data) });

// Time tracking — employee clocks in/out; admin reviews + settles.
export const getTimeEntries   = (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/time-entries${qs ? '?' + qs : ''}`); };
export const clockIn          = (data = {}) => request('/time-entries?action=clock-in', { method: 'POST', body: JSON.stringify(data) });
export const clockOut         = (data = {}) => request('/time-entries?action=clock-out', { method: 'POST', body: JSON.stringify(data) });
export const addTimeEntry     = (data) => request('/time-entries?action=add', { method: 'POST', body: JSON.stringify(data) });
export const markTimePaid     = (data) => request('/time-entries?action=mark-paid', { method: 'POST', body: JSON.stringify(data) });
export const setEmployeeRate  = (data) => request('/time-entries?action=set-rate', { method: 'POST', body: JSON.stringify(data) });
export const updateTimeEntry  = (id, data) => request(`/time-entries?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTimeEntry  = (id) => request(`/time-entries?id=${id}`, { method: 'DELETE' });

// Employee resources — internal team hub (SOPs, guides, links). Admin edits.
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
export const getProjectItems    = (project_id) => request(`/project-items?project_id=${project_id}`);
export const createProjectItem  = (data) => request('/project-items', { method: 'POST', body: JSON.stringify(data) });
export const updateProjectItem  = (id, data) => request(`/project-items?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteProjectItem  = (id) => request(`/project-items?id=${id}`, { method: 'DELETE' });

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

// Gmail labels — real Gmail labels, two-way synced (create here -> exists in
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

// Resources (public resources pages — grouped by category)
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
export const getClientTasks   = (client_id) => request(`/client-tasks?client_id=${client_id}`);
export const createClientTask = (data)      => request('/client-tasks', { method: 'POST', body: JSON.stringify(data) });
export const updateClientTask = (id, data)  => request(`/client-tasks?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientTask = (id)        => request(`/client-tasks?id=${id}`, { method: 'DELETE' });

// Personal dashboard to-do list (per-user; urgent items float to top)
export const getTodos   = ()        => request('/todos');
export const createTodo = (data)    => request('/todos', { method: 'POST', body: JSON.stringify(data) });
export const updateTodo = (id, data)=> request(`/todos?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodo = (id)      => request(`/todos?id=${id}`, { method: 'DELETE' });

// Client activity (notes / calls / tasks)
export const getClientActivity    = (client_id, type) => request(`/client-activity?client_id=${client_id}${type ? '&type=' + type : ''}`);
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
export const sendAgreementForSignature = (id)  => request(`/agreements?id=${id}&action=send`, { method: 'POST' });
export const updatePayment       = (id, status) => request(`/agreements?id=${id}&action=payment`, { method: 'PATCH', body: JSON.stringify({ status }) });
// AI agreement builder
export const analyzeDeal      = (client_id)        => request('/agreement-ai?action=analyze', { method: 'POST', body: JSON.stringify({ client_id }) });
export const generateAgreement = (client_id, terms) => request('/agreement-ai?action=generate', { method: 'POST', body: JSON.stringify({ client_id, terms }) });
export const approveAgreement  = (client_id, draft) => request('/agreement-ai?action=approve', { method: 'POST', body: JSON.stringify({ client_id, draft }) });

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

// Client logo upload — also persists logo_url on crm_content_clients
export const uploadClientLogo = (data) => request('/client-logo-upload', { method: 'POST', body: JSON.stringify(data) });

// AI-generate an email template using the client's brand bible + logo + colors
export const generateEmailTemplateAI = (data) => request('/email-template-ai', { method: 'POST', body: JSON.stringify(data) });

// AI edit pass over existing HTML — body: { client_id, html, instruction, selection? }
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
// Live MailerLite subscribers (marketing audience) — optionally filtered by group
export const getMailerliteSubscribers = (client_id, group_id) =>
  request(`/mailerlite-subscribers?client_id=${client_id}${group_id ? `&group_id=${group_id}` : ''}`);

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

// Upload file to storage (uses signed URL — uploads directly to Supabase)
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

// Team & Access — retired. Use the admin-users helpers instead
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
