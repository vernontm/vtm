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
    throw new Error(err.error || err.detail || `${res.status}: ${res.statusText}`);
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

// Gmail Thread
export const getGmailThread = (threadId) => request(`/gmail-thread?threadId=${encodeURIComponent(threadId)}`);

// Gmail Trash
export const trashGmailMessage = (messageId) => request('/gmail-trash', { method: 'POST', body: JSON.stringify({ messageId }) });

// AI Follow-ups
export const getAIFollowups = () => request('/ai-followups');

// Subscriptions
export const getSubscriptions = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/subscriptions${qs ? '?' + qs : ''}`);
};
export const createSubscription = (data) => request('/subscriptions', { method: 'POST', body: JSON.stringify(data) });
export const updateSubscription = (id, data) => request(`/subscriptions?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteSubscription = (id) => request(`/subscriptions?id=${id}`, { method: 'DELETE' });
export const scanSubscriptions = () => request('/subscriptions?action=scan', { method: 'POST' });

// Label Definitions (custom labels with colors)
export const getLabelDefs = () => request('/label-defs');
export const createLabelDef = (data) => request('/label-defs', { method: 'POST', body: JSON.stringify(data) });
export const deleteLabelDef = (id) => request(`/label-defs?id=${id}`, { method: 'DELETE' });

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

// Todos
export const getTodoGroups   = ()       => request('/todos?type=groups');
export const createTodoGroup = (data)   => request('/todos?type=groups', { method: 'POST', body: JSON.stringify(data) });
export const updateTodoGroup = (id, data) => request(`/todos?type=groups&id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodoGroup = (id)     => request(`/todos?type=groups&id=${id}`, { method: 'DELETE' });
export const getTodos        = ()       => request('/todos');
export const createTodo      = (data)   => request('/todos', { method: 'POST', body: JSON.stringify(data) });
export const updateTodo      = (id, data) => request(`/todos?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTodo      = (id)     => request(`/todos?id=${id}`, { method: 'DELETE' });

// Outreach Clients
export const getClients = () => request('/clients');
export const getClient = (id) => request(`/clients?id=${id}`);
export const getClientByContact = (contactId) => request(`/clients?contact_id=${contactId}`);
export const createClient = (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id, data) => request(`/clients?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClient = (id) => request(`/clients?id=${id}`, { method: 'DELETE' });

// Client Leads
export const getClientLeads = (clientId) => request(`/client-leads?client_id=${clientId}`);
export const createClientLead = (data) => request('/client-leads', { method: 'POST', body: JSON.stringify(data) });
export const updateClientLead = (id, data) => request(`/client-leads?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteClientLead = (id) => request(`/client-leads?id=${id}`, { method: 'DELETE' });

// Outreach Queue
export const getOutreachQueue = (clientId) => request(`/outreach-queue?client_id=${clientId}`);
export const updateOutreachItem = (id, data) => request(`/outreach-queue?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteOutreachItem = (id) => request(`/outreach-queue?id=${id}`, { method: 'DELETE' });
export const sendApprovedEmails = (clientId) => request(`/outreach-queue?client_id=${clientId}&action=send-approved`, { method: 'POST', body: '{}' });
export const clearOutreachQueue = (clientId) => request(`/outreach-queue?client_id=${clientId}&action=clear-all`, { method: 'DELETE' });
export const clearClientLeads = (clientId) => request(`/client-leads?client_id=${clientId}&action=clear-all`, { method: 'DELETE' });

// Outreach AI
export const scanBrand = (data) => request('/scan-brand', { method: 'POST', body: JSON.stringify(data) });
export const researchLeads = (data) => request('/research-leads', { method: 'POST', body: JSON.stringify(data) });
export const generateOutreach = (data) => request('/generate-outreach', { method: 'POST', body: JSON.stringify(data) });
export const outreachChat = (data) => request('/outreach-chat', { method: 'POST', body: JSON.stringify(data) });
export const rewriteEmail = (data) => request('/rewrite-email', { method: 'POST', body: JSON.stringify(data) });

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
export const getAcademyThread = (userId) => academyRequest(`/admin-messages?user_id=${userId}`);
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

// Upload file to storage
export async function uploadAcademyFile(bucket, path, file, contentType) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const reader = new FileReader();
  const base64 = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await fetch(`${ACADEMY}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ bucket, path, file: base64, content_type: contentType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

// Lesson content items (media)
export const createLessonContent = (data) => academyRequest('/admin-lessons?action=add-content', { method: 'POST', body: JSON.stringify(data) });
export const deleteLessonContent = (id) => academyRequest(`/admin-lessons?action=delete-content&content_id=${id}`, { method: 'DELETE' });
