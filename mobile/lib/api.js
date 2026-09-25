// Thin API client for the VTM CRM backend. Same endpoints the web CRM uses,
// authenticated with the Supabase session token.
import { supabase } from './supabase';

const BASE = 'https://www.vernontm.com/api/crm';

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
export const createMeeting = (data) => request('/meetings?action=create', { method: 'POST', body: JSON.stringify(data) });
// Edit / delete an existing event (syncs to Google Calendar server-side).
export const updateMeeting = (id, data) => request(`/meetings?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMeeting = (id) => request(`/meetings?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Team (admin) ──
export const getAdminUsers = () => request('/admin-users');

// ── Time clock ──
export const getTimeEntries = (userId) => request(`/time-entries${userId ? `?user_id=${userId}` : ''}`);
export const payTimeRange = (data) => request('/time-entries?action=pay-range', { method: 'POST', body: JSON.stringify(data) });
export const clockIn = () => request('/time-entries?action=clock-in', { method: 'POST', body: '{}' });
export const clockOut = () => request('/time-entries?action=clock-out', { method: 'POST', body: '{}' });
export const addTimeEntry = (data) => request('/time-entries?action=add', { method: 'POST', body: JSON.stringify(data) });

// ── Clients + invoicing pipeline ──
export const getClients = () => request('/clients');
export const createClient = (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) });

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
export const sendImsg         = (phone, body) => request('/imessage?action=send', { method: 'POST', body: JSON.stringify({ phone, body }) });
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

// CRM assistant (Claude with tools) + availability finder.
export const askAssistant = (prompt, conversation = []) => request('/assistant', { method: 'POST', body: JSON.stringify({ prompt, conversation }) });
export const getAvailability = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/availability${qs ? '?' + qs : ''}`);
};

export const SIGN_BASE = 'https://vernontm.com/sign?token=';
export const PAY_BASE = 'https://vernontm.com/api/crm/pay-deposit?token=';
