import { supabase } from './lib/supabase';

const BASE = '/api/crm';

async function request(path, options = {}) {
  // Get the current Supabase session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

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

// Deals
export const getDeals    = () => request('/deals');
export const createDeal  = (data) => request('/deals', { method: 'POST', body: JSON.stringify(data) });
export const updateDeal  = (id, data) => request(`/deals?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteDeal  = (id) => request(`/deals?id=${id}`, { method: 'DELETE' });

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

// Gmail Inbox
export const getGmailInbox = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/gmail-inbox${qs ? '?' + qs : ''}`);
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

// Todos
export const getTodoGroups   = ()       => request('/todos?type=groups');
export const createTodoGroup = (data)   => request('/todos?type=groups', { method: 'POST', body: JSON.stringify(data) });
export const updateTodoGroup = (id, data) => request(`/todos?type=groups&id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodoGroup = (id)     => request(`/todos?type=groups&id=${id}`, { method: 'DELETE' });
export const getTodos        = ()       => request('/todos');
export const createTodo      = (data)   => request('/todos', { method: 'POST', body: JSON.stringify(data) });
export const updateTodo      = (id, data) => request(`/todos?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodo      = (id)     => request(`/todos?id=${id}`, { method: 'DELETE' });
