// Thin API client for the VTM CRM backend. Same endpoints the web CRM uses,
// authenticated with the Supabase session token.
import { supabase } from './supabase';
import { trackAction } from './track';

const BASE = 'https://www.vernontm.com/api/crm';

// Logs a named action once the call succeeds (usage tracking; names only).
const logged = (name, fn) => async (...args) => { const r = await fn(...args); trackAction(name); return r; };

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

// ── Meetings / calendar ──
export const getUpcomingMeetings = () => request('/meetings?action=upcoming');
export const getPastMeetings = () => request('/meetings?action=past');
export const createMeeting = logged('meeting_created', (data) => request('/meetings?action=create', { method: 'POST', body: JSON.stringify(data) }));
// Edit / delete an existing event (syncs to Google Calendar server-side).
export const updateMeeting = (id, data) => request(`/meetings?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMeeting = (id) => request(`/meetings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Team (admin) ──
export const getAdminUsers = () => request('/admin-users');

// ── App settings (work hours, automation templates) ──
export const getSettings = () => request('/settings');
export const bulkUpdateSettings = (settings) => request('/settings?action=bulk', { method: 'POST', body: JSON.stringify({ settings }) });

// ── Time clock ──
export const getTimeEntries = (userId) => request(`/time-entries${userId ? `?user_id=${userId}` : ''}`);
export const payTimeRange = (data) => request('/time-entries?action=pay-range', { method: 'POST', body: JSON.stringify(data) });
export const clockIn = logged('clock_in', () => request('/time-entries?action=clock-in', { method: 'POST', body: '{}' }));
export const clockOut = logged('clock_out', () => request('/time-entries?action=clock-out', { method: 'POST', body: '{}' }));
export const addTimeEntry = (data) => request('/time-entries?action=add', { method: 'POST', body: JSON.stringify(data) });

// ── Clients + invoicing pipeline ──
export const getClients = () => request('/clients');
export const updateClient = (id, data) => request(`/clients?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const createClient = logged('lead_created', (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }));

// ── Tasks: recurring checklists (routines) + the shared to-do list ──
// Routines: { routines: [{ id, title, cadence, items:[{id,text}], position }], checks: [{ item_id, period_key, done_by_name, done_at }] }
export const getRoutines = () => request('/routines');
export const checkRoutineItem = logged('routine_checked', (routine_id, item_id, period_key, done) => request('/routines?action=check', { method: 'POST', body: JSON.stringify({ routine_id, item_id, period_key, done }) }));
export const createRoutine = (data) => request('/routines', { method: 'POST', body: JSON.stringify(data) });
export const updateRoutine = (id, data) => request(`/routines?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
// Team to-dos: [{ id, title, urgent, done, created_by, created_by_name, assigned_to, assigned_to_name, done_at, link_* }]
export const getTeamTodos = () => request('/team-todos');
export const getTeamMembers = () => request('/team-todos?members=1');
export const addTeamTodo = logged('task_created', (data) => request('/team-todos', { method: 'POST', body: JSON.stringify(data) }));
export const updateTeamTodo = (id, data) => request(`/team-todos?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTeamTodo = (id) => request(`/team-todos?id=${id}`, { method: 'DELETE' });
// Reminders: { reminders: [{ id, title, remind_at, for_user, for_user_name, created_by, created_by_name, task_type, task_id, source, status, done_at }], needs_migration? }
export const getReminders = () => request('/reminders');
export const addReminder = logged('reminder_created', (data) => request('/reminders', { method: 'POST', body: JSON.stringify(data) }));
export const updateReminder = (id, data) => request(`/reminders?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteReminder = (id) => request(`/reminders?id=${id}`, { method: 'DELETE' });
// Scheduled follow-up texts (thank-you the morning after an in-person meetup):
// { followups: [{ id, meeting_title, phone, client_id, kind, send_at, status, body, sent_at }] }
export const getFollowups = () => request('/followups');
export const cancelFollowup = (id) => request(`/followups?id=${id}`, { method: 'DELETE' });

// ── Contacts (everyone: people we talk to) ──
// The contacts endpoint is workspace-scoped via the X-Client-Id header; the
// workspace id comes from /me (first client grant).
export const getMe = () => request('/me');
export const getContacts = (workspaceId) => request('/contacts', { headers: { 'X-Client-Id': workspaceId } });
export const createContact = (workspaceId, data) => request('/contacts', { method: 'POST', headers: { 'X-Client-Id': workspaceId }, body: JSON.stringify(data) });
export const getAgreements = (clientId) => request(`/agreements?client_id=${clientId}`);

// ── iMessage inbox (two-way texting from the business number) ──
// Same endpoints the web CRM Inbox uses. Outbound is queued here and delivered
// by the bridge on the Mac; replies are forwarded back.
export const getImsgThreads   = () => request('/imessage');
export const getImsgThread    = (phone) => request(`/imessage?phone=${encodeURIComponent(phone)}`);
export const sendImsg         = logged('text_sent', (phone, body, attachments) => request('/imessage?action=send', { method: 'POST', body: JSON.stringify({ phone, body, attachments: attachments || undefined }) }));
// Media: ask for a signed upload spot, PUT the bytes there, then send with { url, type, name, mime, size, width, height }.
export const getImsgUploadUrl = (name) => request('/imessage?action=upload-url', { method: 'POST', body: JSON.stringify({ name }) });
export async function uploadFile(localUri, name, mime) {
  const { uploadUrl, publicUrl } = await getImsgUploadUrl(name);
  const blob = await (await fetch(localUri)).blob();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime || blob.type || 'application/octet-stream' }, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return { url: publicUrl, size: blob.size, mime: mime || blob.type || '' };
}
export const getImsgDirectory = () => request('/imessage?action=directory');
export const markImsgRead     = (phone) => request('/imessage?action=read', { method: 'POST', body: JSON.stringify({ phone }) });
export const getImsgNotes     = (phone) => request(`/imessage?action=notes&phone=${encodeURIComponent(phone)}`);
export const addImsgNote      = (phone, body) => request('/imessage?action=note', { method: 'POST', body: JSON.stringify({ phone, body }) });
export const getImsgEvents    = (phone) => request(`/imessage?action=events&phone=${encodeURIComponent(phone)}`);
export const assignImsgThread = (phone, assigned_to, assigned_to_name) => request('/imessage?action=assign', { method: 'POST', body: JSON.stringify({ phone, assigned_to, assigned_to_name }) });
export const setImsgKind      = (phone, kind) => request('/imessage?action=set-kind', { method: 'POST', body: JSON.stringify({ phone, kind }) });
export const getAssignees     = () => request('/assignees');
// Temperature lives on the linked lead (crm_clients.lead_temperature).
export const setClientTemperature = (id, lead_temperature) => request(`/clients?id=${id}`, { method: 'PUT', body: JSON.stringify({ lead_temperature }) });

// Places lookup for location fields (Google Places via the server when the key
// is set, OpenStreetMap otherwise). { configured, results:[{main, secondary, description}] }
export const searchPlaces = (q) => request(`/places?q=${encodeURIComponent(q)}`);
export const getPlaceDetail = (placeId) => request(`/places?place_id=${encodeURIComponent(placeId)}`);

// ── Team chat (internal: direct messages and group chats) ──
// rooms: { rooms: [{ id, kind, name, members:[{user_id,user_name,role}], unread, last_message_at, last_message_preview, last_sender_name }], needs_migration? }
export const getChatRooms    = () => request('/chat?action=rooms');
export const getChatPeople   = () => request('/chat?action=people');
export const getChatMessages = (room, after) => request(`/chat?action=messages&room=${encodeURIComponent(room)}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
export const createChat      = logged('chat_created', (data) => request('/chat?action=create', { method: 'POST', body: JSON.stringify(data) }));
export const sendChat        = logged('chat_sent', (room, body) => request('/chat?action=send', { method: 'POST', body: JSON.stringify({ room, body }) }));
export const renameChat      = (room, name) => request('/chat?action=rename', { method: 'POST', body: JSON.stringify({ room, name }) });
export const changeChatMembers = (room, add, remove) => request('/chat?action=members', { method: 'POST', body: JSON.stringify({ room, add, remove }) });
export const markChatRead    = (room) => request('/chat?action=read', { method: 'POST', body: JSON.stringify({ room }) });
export const leaveChat       = (room) => request('/chat?action=leave', { method: 'POST', body: JSON.stringify({ room }) });

// CRM assistant (Claude with tools) + availability finder.
export const askAssistant = logged('assistant_asked', (prompt, conversation = []) => request('/assistant', { method: 'POST', body: JSON.stringify({ prompt, conversation }) }));
// Actions mode: { actions: [{ type:'create_meeting', title, start, end, when, duration_minutes, kind, location, summary, message, confidence, reason }] }
export const proposeActions = logged('smart_actions_checked', (prompt) => request('/assistant', { method: 'POST', body: JSON.stringify({ prompt, mode: 'actions' }) }));
export const getAvailability = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/availability${qs ? '?' + qs : ''}`);
};

// ── Role homes, money, nudges, agreements (docs/engineer/role-homes-contracts.md) ──
export const getHome = (role) => request(`/home${role ? `?role=${encodeURIComponent(role)}` : ''}`);
export const getHomeRoles = () => request('/settings').then(rows => {
  const list = Array.isArray(rows) ? rows : (rows?.settings || rows?.rows || []);
  const raw = list.find(r => r.key === 'home_roles')?.value;
  try { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; } catch (_) { return {}; }
});
export const setHomeRoles = (map) => bulkUpdateSettings([{ key: 'home_roles', value: JSON.stringify(map || {}) }]);
export const draftNudge = (data) => request('/nudges?action=draft', { method: 'POST', body: JSON.stringify(data) });
export const sendNudge = logged('nudge_sent', (data) => request('/nudges', { method: 'POST', body: JSON.stringify(data) }));
export const getNudges = (kind, id) => request(`/nudges?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
// view=overview returns the merged overview (files, activity, balance, plan);
// the plain GET stays the raw activity list the web CRM reads.
export const getClientActivity = (client_id) => request(`/client-activity?client_id=${encodeURIComponent(client_id)}&view=overview`);
export const agreementAnalyze = (client_id) => request('/agreement-ai?action=analyze', { method: 'POST', body: JSON.stringify({ client_id }) });
export const agreementGenerate = (data) => request('/agreement-ai?action=generate', { method: 'POST', body: JSON.stringify(data) });
// Creating the agreement row from a draft is agreement-ai's approve; the
// agreements endpoint's approve only links the deal on the pipeline.
export const agreementApprove = logged('agreement_finalized', (client_id, draft) => request('/agreement-ai?action=approve', { method: 'POST', body: JSON.stringify({ client_id, draft }) }));
export const linkAgreementDeal = (id) => request(`/agreements?action=approve&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });
export const markAgreementSent = (id) => request(`/agreements?action=mark-sent&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });
export const sendAgreement = logged('agreement_sent', (id) => request(`/agreements?action=send&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' }));
export const textSignLink = (id) => request(`/agreements?action=text-sign-link&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });
export const countRoutineItem = logged('routine_counted', (routine_id, item_id, period_key, count) => request('/routines?action=count', { method: 'POST', body: JSON.stringify({ routine_id, item_id, period_key, count }) }));

export const SIGN_BASE = 'https://vernontm.com/sign?token=';
export const PAY_BASE = 'https://vernontm.com/api/crm/pay-deposit?token=';
