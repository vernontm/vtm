import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sheet, { SheetRow } from '../components/Sheet';
import {
  getImsgThread, sendImsg, getImsgDirectory, getImsgEvents, getImsgNotes, addImsgNote,
  getImsgThreads, assignImsgThread, setImsgKind, setClientTemperature, getAssignees, markImsgRead, getAvailability, askAssistant,
  getClients, getAgreements, getTeamTodos, getUpcomingMeetings, proposeActions, createMeeting, updateClient, getSettings, uploadFile,
} from '../lib/api';
import { parseAutomations, fillTemplate } from '../lib/templates';
import { openAppSettings } from '../lib/push';
import { C, T, F } from '../lib/theme';
import { Screen, IconButton, Avatar, Chip, Dot, GradientChip, Orb, Button, TEMP, KIND_COLOR } from '../components/ui';
import { last10, firstName, fmtPhone, fmtDateTime, KIND, TEMPS, colorForEmployee } from '../lib/imsg';

// Rough detector for "this conversation is about setting up a time".
const SCHED_RE = /\b(meet|meeting|meet ?up|schedule|scheduling|availab|appointment|calendar|what time|when (are|can|could|is|works?|would)|free|book|sit ?down|come in|stop by|get together|reschedul)\b/i;
// A reply that sounds like the customer just agreed to a time: worth asking
// the assistant whether there is something to book.
const CONFIRM_RE = /\b(\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)|works for me|that works|sounds good|let'?s do (it|that)|book it|perfect|see you (then|at)|confirm(ed)?|yes,? (that|the)|i'?ll take|either (one|works))\b/i;

export default function ConversationScreen({ route, navigation }) {
  const phone = route.params?.phone;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [person, setPerson] = useState(null);   // { id, kind, name, temperature }
  const [assignment, setAssignment] = useState(null); // { assigned_to, assigned_to_name }
  const [assignees, setAssignees] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);   // a picked photo or video, not sent yet
  const [viewer, setViewer] = useState(null);               // full-screen image url
  const [suggestSlots, setSuggestSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [tempOpen, setTempOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const draftHistory = useRef([]);
  const dossier = useRef(null);   // what we know about this person, built once per visit
  const personRecord = useRef(null);
  const [actions, setActions] = useState([]);       // smart actions the assistant proposed
  const [actionsBusy, setActionsBusy] = useState(false);
  const [acting, setActing] = useState(null);       // the action being carried out
  const analyzedId = useRef(null);                  // last inbound message we asked about
  const scrollRef = useRef(null);

  const loadPerson = useCallback(async () => {
    try {
      const dir = await getImsgDirectory().catch(() => []);
      setPerson((dir || []).find(p => last10(p.phone) === last10(phone)) || null);
    } catch (_) {}
  }, [phone]);
  const loadAssignment = useCallback(async () => {
    try {
      const th = await getImsgThreads().catch(() => []);
      const t = (th || []).find(x => last10(x.phone) === last10(phone));
      setAssignment(t ? { assigned_to: t.assigned_to, assigned_to_name: t.assigned_to_name } : null);
    } catch (_) {}
  }, [phone]);
  const loadMsgs = useCallback(async () => { try { setMessages(await getImsgThread(phone) || []); } catch (_) {} }, [phone]);
  const loadEvents = useCallback(async () => { try { setEvents(await getImsgEvents(phone) || []); } catch (_) {} }, [phone]);
  const loadNotes = useCallback(async () => { try { setNotes(await getImsgNotes(phone) || []); } catch (_) {} }, [phone]);

  // A draft handed over from elsewhere (a team chat action) lands in the box.
  useEffect(() => { if (route.params?.draft) setInput(route.params.draft); }, [route.params?.draftAt]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMsgs(), loadPerson(), loadAssignment(), loadEvents(), loadNotes()]);
      getAssignees().then(r => setAssignees(Array.isArray(r) ? r : (r?.employees || []))).catch(() => {});
      setLoading(false);
    })();
    markImsgRead(phone).catch(() => {});
    const t = setInterval(() => { loadMsgs(); loadEvents(); markImsgRead(phone).catch(() => {}); }, 6000);
    return () => clearInterval(t);
  }, [phone]);

  const timeline = useMemo(() => {
    const items = [
      ...messages.map(m => ({ t: 'msg', at: m.created_at, key: 'm' + m.id, m })),
      ...events.filter(e => e.type === 'handoff').map(e => ({ t: 'ho', at: e.created_at, key: 'e' + e.id, e })),
    ];
    items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    return items;
  }, [messages, events]);

  // Scheduling suggestions when the conversation is about setting up a time.
  const lastMsgId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!messages.length) { setSuggestSlots([]); return; }
    const recent = messages.slice(-8).map(m => m.body || '').join(' ');
    if (!SCHED_RE.test(recent)) { setSuggestSlots([]); return; }
    let cancelled = false;
    getAvailability({ duration: 60, days: 10, limit: 30 }).then(r => {
      if (cancelled) return;
      const tz = r?.tz || 'America/Chicago';
      const seen = new Set(); const pick = [];
      for (const s of (r?.slots || [])) {
        const day = new Date(s.start).toLocaleDateString('en-US', { timeZone: tz });
        if (seen.has(day)) continue;
        seen.add(day); pick.push(s);
        if (pick.length >= 3) break;
      }
      setSuggestSlots(pick);
    }).catch(() => setSuggestSlots([]));
    return () => { cancelled = true; };
  }, [lastMsgId]);

  const proposeTime = (s) => {
    setInput(prev => { const b = (prev || '').trim(); return b ? `${b} Or ${s.label}?` : `Would ${s.label} work for you?`; });
  };

  // Photos and videos: pick from the library, upload straight to storage, then
  // the message goes out with the media attached (the bridge sends the file).
  const pickMedia = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        // iOS asks for photo access once; after that the switch lives in Settings.
        return Alert.alert('Photos access is off', 'Open Settings, tap Photos, and allow access so you can send photos and videos.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]);
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsMultipleSelection: false });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (a.fileSize && a.fileSize > 40 * 1024 * 1024) return Alert.alert('Too big', 'Keep photos and videos under 40 MB.');
      setPendingMedia(a);
    } catch (e) { Alert.alert('Could not open your photos', e.message); }
  };
  const send = async () => {
    const body = input.trim();
    if (!body && !pendingMedia) return;
    setSending(true);
    try {
      let attachments;
      if (pendingMedia) {
        const a = pendingMedia;
        const isVideo = a.type === 'video' || /^video\//.test(a.mimeType || '');
        const name = a.fileName || `${isVideo ? 'video' : 'photo'}-${Date.now()}.${isVideo ? 'mov' : 'jpg'}`;
        const up = await uploadFile(a.uri, name, a.mimeType || (isVideo ? 'video/quicktime' : 'image/jpeg'));
        attachments = [{ url: up.url, type: isVideo ? 'video' : 'image', name, mime: up.mime, size: up.size, width: a.width || null, height: a.height || null }];
      }
      await sendImsg(phone, body, attachments);
      setInput(''); setPendingMedia(null);
      await loadMsgs();
    }
    catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };
  const mediaBox = (w, h, max = 220) => {
    if (!w || !h) return { width: max, height: max * 0.75 };
    const r = Math.min(max / w, max / h, 1);
    return { width: Math.max(120, Math.round(w * r)), height: Math.max(90, Math.round(h * r)) };
  };

  const setTemp = async (key) => {
    setTempOpen(false);
    if (!person?.id) return;
    setPerson(p => ({ ...p, temperature: key }));
    try { await setClientTemperature(person.id, key); } catch (e) { Alert.alert('Could not update', e.message); loadPerson(); }
  };
  const assign = async (emp) => {
    setAssignOpen(false);
    setAssignment({ assigned_to: emp?.id || null, assigned_to_name: emp?.name || null });
    try { await assignImsgThread(phone, emp?.id || null, emp?.name || null); loadEvents(); }
    catch (e) { Alert.alert('Could not assign', e.message); loadAssignment(); }
  };
  const changeKind = async (kind) => {
    setKindOpen(false);
    const cur = person?.kind || null;
    if (kind === cur) return;
    if (kind === 'contact' && (cur === 'lead' || cur === 'client')) {
      Alert.alert('Make this a contact?', 'This removes the lead/client record and its pipeline data. The conversation and notes stay.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Make contact', style: 'destructive', onPress: () => doKind(kind) }]);
      return;
    }
    doKind(kind);
  };
  const doKind = async (kind) => {
    try { await setImsgKind(phone, kind); await loadPerson(); } catch (e) { Alert.alert('Could not change type', e.message); }
  };
  const addNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setNoteBusy(true);
    try { await addImsgNote(phone, body); setNoteText(''); await loadNotes(); }
    catch (e) { Alert.alert('Could not add note', e.message); }
    finally { setNoteBusy(false); }
  };

  const kind = person?.kind || null;
  const canTemp = !!person?.id && kind !== 'contact';
  const temp = person?.temperature ? TEMP[person.temperature] : null;
  const name = person?.name || fmtPhone(phone);
  const subLine = [person?.kind ? KIND[person.kind].label : null, fmtPhone(phone)].filter(Boolean).join(' · ');
  // The orb in the composer opens the drafting sheet: smart drafts to tap into
  // the message box, plus a line to tell the assistant what to write or do.
  // Nothing is ever sent to the customer from here.
  const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const threadText = () => {
    const recent = messages.slice(-15);
    if (!recent.length) return '(no messages yet)';
    const cut = Math.max(0, recent.length - 4);
    return recent.map((m, i) => `${i === cut ? '[most recent from here]\n' : ''}${fmtWhen(m.created_at)} ${m.direction === 'out' ? 'Us' : name}: ${m.body}`).join('\n');
  };

  // Everything the CRM knows about this person, in a few lines: their record,
  // money status (clients), internal notes, who owns the thread, open tasks
  // about them, meetings with them. Fetched once when the sheet first opens.
  const buildDossier = async () => {
    const lines = [];
    const key = String(name || '').toLowerCase().split(/\s+/)[0];
    const mentions = (s) => key && key.length > 2 && String(s || '').toLowerCase().includes(key);
    let record = null;
    try {
      if (person?.id && person.kind !== 'contact') {
        const clients = await getClients();
        record = (clients || []).find(c => c.id === person.id) || null;
      }
    } catch (_) {}
    personRecord.current = record;
    if (record) {
      const money = record.potential_value ? `$${Number(record.potential_value).toLocaleString()}${record.potential_value_type === 'monthly' ? '/mo' : ''}` : null;
      lines.push(`Record: ${record.business_name || ''}${record.owner_name ? ` (${record.owner_name})` : ''}, ${person.kind}, stage ${record.stage || 'unknown'}${record.lead_temperature ? `, heat ${record.lead_temperature}` : ''}${record.source ? `, source ${record.source}` : ''}${money ? `, value ${money}` : ''}${record.follow_up_due_date ? `, follow-up due ${record.follow_up_due_date}` : ''}.`);
      if (record.notes) lines.push(`Record notes: ${String(record.notes).slice(0, 400)}`);
      if (person.kind === 'client') {
        try {
          const ag = await getAgreements(record.id);
          const a = (ag?.agreements || [])[0];
          const pays = ag?.payments || [];
          const next = pays.find(p => p.status !== 'paid');
          if (a) lines.push(`Agreement: ${a.title || 'Service agreement'}, ${a.status}${a.signed_at ? ` (signed ${fmtWhen(a.signed_at)})` : ''}; ${pays.filter(p => p.status === 'paid').length} of ${pays.length} payments paid${next ? `; next due: ${next.label || 'payment'} $${Number(next.amount || 0).toLocaleString()} (${next.due_condition || 'pending'})` : ''}.`);
        } catch (_) {}
      }
      const [todos, meetings] = await Promise.all([getTeamTodos().catch(() => []), getUpcomingMeetings().catch(() => [])]);
      const related = (todos || []).filter(t => !t.done && ((t.link_id && t.link_id === record.id) || mentions(t.title) || mentions(t.link_label)));
      if (related.length) lines.push(`Open tasks about them: ${related.slice(0, 5).map(t => `${t.title}${t.assigned_to_name ? ` (${t.assigned_to_name})` : ''}`).join('; ')}.`);
      const email = String(record.contact_email || '').toLowerCase();
      const withThem = (meetings || []).filter(m => mentions(m.title) || (email && (m.participants || []).some(p => String(p?.email || p || '').toLowerCase() === email)));
      if (withThem.length) lines.push(`Upcoming meetings with them: ${withThem.slice(0, 3).map(m => `${m.title || 'meeting'} on ${fmtWhen(m.start_time)}${m.location ? ` at ${m.location}` : m.meet_link ? ' (Google Meet)' : ''}`).join('; ')}.`);
    } else {
      const [todos, meetings] = await Promise.all([getTeamTodos().catch(() => []), getUpcomingMeetings().catch(() => [])]);
      const related = (todos || []).filter(t => !t.done && (mentions(t.title) || mentions(t.link_label)));
      if (related.length) lines.push(`Open tasks about them: ${related.slice(0, 5).map(t => t.title).join('; ')}.`);
      const withThem = (meetings || []).filter(m => mentions(m.title));
      if (withThem.length) lines.push(`Upcoming meetings with them: ${withThem.slice(0, 3).map(m => `${m.title} on ${fmtWhen(m.start_time)}`).join('; ')}.`);
    }
    if (assignment?.assigned_to_name) lines.push(`This conversation is assigned to ${assignment.assigned_to_name}.`);
    const handoffs = events.filter(e => e.type === 'handoff').slice(-2);
    if (handoffs.length) lines.push(`Recent handoffs: ${handoffs.map(e => `${e.from_name || 'someone'} to ${e.to_name} on ${fmtWhen(e.created_at)}`).join('; ')}.`);
    if (notes.length) lines.push(`Internal notes on this thread (not visible to them): ${notes.slice(-5).map(n => `${n.author_name || 'team'}: ${n.body}`).join(' | ')}`);
    return lines.length ? lines.join('\n') : 'Nothing on file beyond the thread.';
  };
  const contextPrompt = () => [
    `You are helping write iMessages from us (Vernon Tech & Media) to ${name}${person?.kind ? ` (a ${person.kind})` : ''}. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
    `What we know about them:\n${dossier.current || 'Nothing on file beyond the thread.'}`,
    `The thread, oldest to newest (the most recent messages matter most; reply to what they last said, answer any question they asked, and bring in a task, meeting or payment only when it is genuinely relevant):\n${threadText()}`,
    'Match their tone and message length. Never invent facts, prices or dates that are not above. Never mention internal notes as such.',
  ].join('\n\n');
  const parseDrafts = (text) => String(text || '').split(/\n+/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|option\s*\d+:?)\s*/i, '').replace(/^["“]+|["”]+$/g, '').trim())
    .filter(l => l.length >= 4).slice(0, 4);
  const wantsDraft = (s) => /\b(draft|write|reply|respond|say|text|message|shorter|longer|warmer|friendlier|formal|casual|rewrite|propose|suggest|follow[- ]?up|nudge|ask)\b/i.test(s);

  const runDraft = async (instruction, initial = false) => {
    if (draftBusy) return;
    setDraftBusy(true);
    setDraftNote('');
    try {
      const prompt = initial
        ? `${contextPrompt()}\n\n${instruction}`
        : `${contextPrompt()}\n\nInstruction from us: ${instruction}\n${wantsDraft(instruction) ? 'Reply with ONLY the message text we should send (or up to three options, one per line). No numbering, no quotes, no preamble.' : 'Answer briefly and plainly.'}`;
      const r = await askAssistant(prompt, draftHistory.current);
      const answer = String(r?.answer || '').trim();
      draftHistory.current = [...draftHistory.current, { role: 'user', content: instruction }, { role: 'assistant', content: answer }].slice(-10);
      if (initial || wantsDraft(instruction)) {
        const opts = parseDrafts(answer);
        if (opts.length) setDrafts(opts); else setDraftNote(answer || 'No draft came back.');
      } else {
        setDraftNote(answer || 'No answer.');
      }
    } catch (e) { setDraftNote(`Could not reach the assistant: ${e.message}`); }
    finally { setDraftBusy(false); }
  };
  const ensureDossier = async () => {
    if (dossier.current !== null) return;
    try { dossier.current = await buildDossier(); } catch (_) { dossier.current = ''; }
  };

  // Ask the assistant whether the thread calls for an action (a booking, for
  // now). Runs when the sheet opens and when a reply sounds like a yes.
  const detectActions = async () => {
    if (actionsBusy) return;
    setActionsBusy(true);
    try {
      await ensureDossier();
      const r = await proposeActions(contextPrompt());
      setActions(Array.isArray(r?.actions) ? r.actions : []);
    } catch (_) { /* keep whatever we had */ }
    finally { setActionsBusy(false); }
  };
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.direction === 'out' || analyzedId.current === last.id) return;
    if (!CONFIRM_RE.test(last.body || '')) return;
    analyzedId.current = last.id;
    detectActions();
  }, [lastMsgId]);

  // Carry an action out: book it on the calendar with them invited, then text
  // them the details. Only ever runs from the person's tap.
  const runAction = async (a) => {
    if (acting) return;
    setActing(a);
    try {
      const rec = personRecord.current;
      const email = rec?.contact_email || rec?.email || null;
      const m = await createMeeting({
        summary: a.title, start: a.start, end: a.end,
        attendees: email ? [email] : [],
        addMeetLink: a.kind === 'online', location: a.kind === 'in_person' ? (a.location || '') : '',
        reminderMinutes: 10,
        // For an in-person meetup the API schedules the next-morning thank-you text to this number.
        phone, client_id: rec?.id || null,
      });
      const link = a.kind === 'online' ? (m?.meet_link || '') : (a.location || '');
      // The confirmation text: the Automations template when it is in
      // template mode, otherwise the assistant's own wording.
      let auto = null;
      try { auto = parseAutomations(await getSettings()); } catch (_) {}
      const conf = auto?.meeting_confirmation;
      const linkLine = link ? (a.kind === 'online' ? `Here's the Google Meet link: ${link}` : `Address: ${link}`) : '';
      let text;
      if (conf && conf.mode !== 'assistant' && conf.template) {
        text = fillTemplate(conf.template, {
          first_name: firstName(rec?.owner_name || name), when: a.when, service: a.service || '',
          service_clause: a.service ? ` to go over ${a.service}` : '', link: linkLine, location: a.location || '',
        });
      } else {
        text = String(a.message || 'You are set for {when}. {link}').replace(/\{when\}/g, a.when).replace(/\{link\}/g, link);
        if (!link) text = text.replace(/\b(here(?:'|’)s|here is)\s+(the|your)\s+(google meet |meet )?link:?\s*/i, '');
      }
      text = text.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
      await sendImsg(phone, text);
      if (rec?.id && rec.stage === 'lead') updateClient(rec.id, { follow_up_status: 'scheduled' }).catch(() => {});
      setActions(prev => prev.filter(x => x !== a));
      setDraftOpen(false);
      await loadMsgs();
      Alert.alert('Booked and texted', `${a.when} is on the calendar${email ? ` with ${email} invited` : ''}, and ${name} has the details.`);
    } catch (e) { Alert.alert('Could not book it', e.message); }
    finally { setActing(null); }
  };

  const openDrafts = async () => {
    setDraftOpen(true);
    if (!actions.length && !actionsBusy) detectActions();
    if (drafts.length || draftBusy) return;
    if (dossier.current === null) {
      setDraftBusy(true);
      try { await ensureDossier(); }
      finally { setDraftBusy(false); }
    }
    runDraft('Write three different replies we could send next: one that directly continues or answers their last message, one that moves things to the next step (a time to meet, a proposal, a payment, whatever fits what we know), and one short and casual. If they asked for a call or meeting, or mentioned a service they want, use find_availability and put two specific times inside our work hours into the next-step option, and name the service back to them. Each one to three sentences, warm and natural, no sign-off, no placeholders. Reply with exactly three options, one per line, no numbering, no quotes, nothing else.', true);
  };
  const useDraft = (text) => { setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text)); setDraftOpen(false); };
  const sendDraftInstruction = () => { const s = draftInput.trim(); if (!s) return; setDraftInput(''); runDraft(s); };
  const DRAFT_CHIPS = [
    ['Shorter', 'Make it shorter.'],
    ['Warmer', 'Make it warmer and more personal.'],
    ['More formal', 'Make it more professional.'],
    ['Propose times', 'Write a reply proposing two times to meet next week inside our work hours, using my real availability.'],
    ['Follow up', 'Write a friendly follow-up nudge, since they have not replied.'],
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 10, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton icon="chevron-back" onPress={() => navigation.goBack()} label="Back to Inbox" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>{name}</Text>
              <Text numberOfLines={1} style={T.sub}>{subLine}</Text>
            </View>
            <IconButton icon="call-outline" onPress={() => Linking.openURL(`tel:${phone}`)} label={`Call ${name}`} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            <Chip label={kind ? KIND[kind].label : 'Set type'} icon="chevron-down" color={kind ? KIND_COLOR[kind] : C.slate} onPress={() => setKindOpen(true)} />
            {canTemp ? (
              <TouchableOpacity onPress={() => setTempOpen(true)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tile, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot color={temp ? temp.dot : C.slate} />
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: temp ? temp.color : C.slate }}>{temp ? temp.label : 'Temperature'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setAssignOpen(true)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tile, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot size={16} color={assignment?.assigned_to_name ? colorForEmployee(assignment.assigned_to || assignment.assigned_to_name) : C.slate} />
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.ink }}>{assignment?.assigned_to_name ? firstName(assignment.assigned_to_name) : 'Assign'}</Text>
              <Ionicons name="chevron-down" size={14} color={C.slate} />
            </TouchableOpacity>
            <Chip label={`Notes${notes.length ? ` · ${notes.length}` : ''}`} onPress={() => setNotesOpen(true)} />
          </ScrollView>
        </View>

        {/* Messages + handoffs */}
        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 10 }}
            keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {timeline.map(it => {
              if (it.t === 'ho') {
                const e = it.e;
                return (
                  <View key={it.key} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.tile, marginVertical: 4 }}>
                    <Dot size={16} color={colorForEmployee(e.to_id || e.to_name)} />
                    <Text style={T.meta}>{e.from_name ? `${firstName(e.from_name)} handed this to ${firstName(e.to_name)}` : `Assigned to ${firstName(e.to_name)}`} · {fmtDateTime(e.created_at)}</Text>
                  </View>
                );
              }
              const m = it.m;
              const out = m.direction === 'out';
              const failed = out && m.status === 'failed';
              const atts = Array.isArray(m.attachments) ? m.attachments : [];
              return (
                <View key={it.key} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3 }}>
                  {atts.map((a, ai) => (
                    a.type === 'image' ? (
                      <TouchableOpacity key={ai} onPress={() => setViewer(a.url)} activeOpacity={0.9} accessibilityLabel="Open photo"
                        style={{ alignSelf: out ? 'flex-end' : 'flex-start', borderRadius: 20, overflow: 'hidden', backgroundColor: C.tile }}>
                        <Image source={{ uri: a.url }} style={mediaBox(a.width, a.height)} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity key={ai} onPress={() => Linking.openURL(a.url)} activeOpacity={0.85} accessibilityLabel={a.type === 'video' ? 'Play video' : 'Open file'}
                        style={{ alignSelf: out ? 'flex-end' : 'flex-start', width: 220, height: a.type === 'video' ? 140 : 56, borderRadius: 20, backgroundColor: out ? C.ink : C.tile, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: out ? 'rgba(255,255,255,0.18)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name={a.type === 'video' ? 'play' : a.type === 'audio' ? 'mic' : 'document-outline'} size={20} color={out ? '#FFFFFF' : C.ink} />
                        </View>
                        <Text style={[T.meta, { color: out ? '#FFFFFF' : C.ink }]}>{a.type === 'video' ? 'Video' : a.type === 'audio' ? 'Voice memo' : (a.name || 'File')}</Text>
                      </TouchableOpacity>
                    )
                  ))}
                  {m.body ? (
                    <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: out ? 6 : 22, borderBottomLeftRadius: out ? 22 : 6, backgroundColor: out ? (failed ? C.red : C.ink) : C.tile }}>
                      <Text style={[T.message, { color: out ? '#FFFFFF' : C.ink }]}>{m.body}</Text>
                    </View>
                  ) : null}
                  <Text style={[T.meta, { fontSize: 11, color: failed ? C.red : C.slate, textAlign: out ? 'right' : 'left' }]}>
                    {fmtDateTime(m.created_at)}{out && m.status ? ` · ${m.status}` : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Suggestions + composer */}
        <View style={{ gap: 10, paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 6, backgroundColor: C.bg }}>
          {(actions.length > 0 || suggestSlots.length > 0) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
              {actions.map((a, i) => <GradientChip key={`a${i}`} label={`Create meeting · ${a.when}`} onPress={openDrafts} />)}
              {suggestSlots.length > 0 ? <Text style={[T.meta, { color: C.violet }]}>Free times</Text> : null}
              {suggestSlots.map(s => <GradientChip key={s.start} label={s.label} onPress={() => proposeTime(s)} />)}
            </ScrollView>
          )}
          {pendingMedia ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
                {pendingMedia.type === 'video' ? <Ionicons name="videocam" size={22} color={C.ink} /> : <Image source={{ uri: pendingMedia.uri }} style={{ width: 64, height: 64 }} resizeMode="cover" />}
              </View>
              <Text style={[T.sub, { flex: 1 }]}>{pendingMedia.type === 'video' ? 'Video' : 'Photo'} ready to send{sending ? ', uploading' : ''}.</Text>
              <IconButton icon="close" size={36} label="Remove attachment" onPress={() => setPendingMedia(null)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 50, borderRadius: 25, backgroundColor: C.tile, paddingLeft: 8, paddingRight: 6, paddingVertical: 8 }}>
              <Orb size={34} icon="sparkles" label="Draft with the assistant" onPress={openDrafts} style={{ shadowOpacity: 0 }} />
              <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingHorizontal: 10, paddingVertical: 6, maxHeight: 120 }}
                placeholder="Message" placeholderTextColor={C.slate} value={input} onChangeText={setInput} multiline />
              <TouchableOpacity onPress={pickMedia} accessibilityLabel="Attach a photo or video" style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="image-outline" size={22} color={pendingMedia ? C.ink : C.slate} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={send} disabled={sending || (!input.trim() && !pendingMedia)} accessibilityLabel="Send"
              style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (sending || (!input.trim() && !pendingMedia)) ? 0.5 : 1 }}>
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="arrow-up" size={22} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Full-screen photo */}
        <Modal visible={!!viewer} animationType="fade" transparent onRequestClose={() => setViewer(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center' }}>
            {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
            <TouchableOpacity onPress={() => setViewer(null)} accessibilityLabel="Close photo" style={{ position: 'absolute', top: insets.top + 12, right: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => viewer && Linking.openURL(viewer)} accessibilityLabel="Open in browser" style={{ position: 'absolute', bottom: insets.bottom + 24, alignSelf: 'center', height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[T.meta, { color: '#FFFFFF' }]}>Open full size</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* Drafting sheet */}
        <Sheet visible={draftOpen} title="Draft with the assistant" onClose={() => setDraftOpen(false)}>
          <Text style={T.sub}>Tap a draft to put it in your message, or tell the assistant what to write or do. Nothing sends until you tap send.</Text>
          {(actions.length > 0 || actionsBusy) && (
            <View style={{ gap: 8 }}>
              <Text style={T.label}>Smart actions</Text>
              {actionsBusy && actions.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line }}>
                  <ActivityIndicator color={C.violet} size="small" />
                  <Text style={T.sub}>Checking whether there is something to book</Text>
                </View>
              ) : null}
              {actions.map((a, i) => {
                const rec = personRecord.current;
                const email = rec?.contact_email || rec?.email || null;
                const busy = acting === a;
                return (
                  <View key={`act${i}`} style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="calendar-outline" size={18} color={C.ink} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={T.title}>{a.title}</Text>
                        <Text style={T.sub}>{a.when} · {a.duration_minutes} min · {a.kind === 'in_person' ? (a.location || 'in person') : 'Google Meet'}</Text>
                      </View>
                    </View>
                    <Text style={T.sub}>{email ? `Invites ${email} and puts it on the calendar, then texts ${name} the details${a.kind === 'online' ? ' and the Meet link' : ''}.` : `Puts it on the calendar (no email on file for an invite), then texts ${name} the details${a.kind === 'online' ? ' and the Meet link' : ''}.`}</Text>
                    <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.tile }}>
                      <Text style={[T.body, { fontSize: 14 }]}>{String(a.message || '').replace(/\{when\}/g, a.when).replace(/\{link\}/g, a.kind === 'online' ? '(Meet link)' : (a.location || ''))}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button label="Not now" kind="soft" small onPress={() => setActions(prev => prev.filter(x => x !== a))} disabled={busy} />
                      <Button label="Create meeting and text them" small busy={busy} onPress={() => runAction(a)} style={{ flex: 1 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          {draftBusy && drafts.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.tile }}>
              <ActivityIndicator color={C.violet} size="small" />
              <Text style={T.sub}>Reading the thread and writing drafts</Text>
            </View>
          ) : null}
          {drafts.map((d, i) => (
            <TouchableOpacity key={`${i}-${d.slice(0, 12)}`} onPress={() => useDraft(d)} activeOpacity={0.8} accessibilityLabel={`Use draft ${i + 1}`}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.tile, opacity: draftBusy ? 0.6 : 1 }}>
              <Ionicons name="sparkles" size={16} color={C.violet} style={{ marginTop: 3 }} />
              <Text style={[T.body, { flex: 1 }]}>{d}</Text>
              <Text style={[T.meta, { color: C.violet, marginTop: 3 }]}>Use</Text>
            </TouchableOpacity>
          ))}
          {draftNote ? (
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, gap: 10 }}>
              <Text style={T.body}>{draftNote}</Text>
              <TouchableOpacity onPress={() => useDraft(draftNote)} accessibilityLabel="Use this text"><Text style={[T.meta, { color: C.violet }]}>Use as my message</Text></TouchableOpacity>
            </View>
          ) : null}
          {draftBusy && drafts.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <ActivityIndicator color={C.violet} size="small" />
              <Text style={T.sub}>Working on it</Text>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {DRAFT_CHIPS.map(([label, instruction]) => <GradientChip key={label} label={label} onPress={() => runDraft(instruction)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 6, justifyContent: 'center' }}>
              <TextInput style={{ fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: 6, maxHeight: 100 }}
                placeholder="Tell it what to write or do" placeholderTextColor={C.slate} value={draftInput} onChangeText={setDraftInput} multiline
                onSubmitEditing={sendDraftInstruction} blurOnSubmit />
            </View>
            <TouchableOpacity onPress={sendDraftInstruction} disabled={draftBusy || !draftInput.trim()} accessibilityLabel="Ask the assistant"
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (draftBusy || !draftInput.trim()) ? 0.5 : 1 }}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Sheet>

        {/* Assign sheet */}
        <Sheet visible={assignOpen} title="Assign conversation" onClose={() => setAssignOpen(false)}>
          {assignees.length === 0 && <Text style={T.sub}>No employees on the roster yet.</Text>}
          {assignees.map(a => (
            <SheetRow key={a.id} label={a.name} sub={a.kind || null} color={colorForEmployee(a.id)} selected={assignment?.assigned_to === a.id} onPress={() => assign(a)} />
          ))}
          {assignment?.assigned_to_name ? <SheetRow label="Unassign" destructive onPress={() => assign(null)} /> : null}
        </Sheet>

        {/* Type sheet */}
        <Sheet visible={kindOpen} title="Conversation type" onClose={() => setKindOpen(false)}>
          {['lead', 'client', 'contact'].map(k => (
            <SheetRow key={k} label={KIND[k].label} color={KIND_COLOR[k]} selected={kind === k} onPress={() => changeKind(k)}
              sub={k === 'lead' ? 'In the pipeline, with a temperature' : k === 'client' ? 'Signed, with agreements and payments' : 'Someone you talk to'} />
          ))}
        </Sheet>

        {/* Temperature sheet */}
        <Sheet visible={tempOpen} title="Lead temperature" onClose={() => setTempOpen(false)}>
          {TEMPS.map(t => (
            <SheetRow key={t.key} label={t.label} color={TEMP[t.key].dot} selected={person?.temperature === t.key} onPress={() => setTemp(t.key)} />
          ))}
        </Sheet>

        {/* Notes sheet */}
        <Sheet visible={notesOpen} title="Internal notes" onClose={() => setNotesOpen(false)}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 15, color: C.ink }}
              placeholder="Note for the team" placeholderTextColor={C.slate} value={noteText} onChangeText={setNoteText} multiline />
            <TouchableOpacity onPress={addNote} disabled={noteBusy || !noteText.trim()} accessibilityLabel="Add note"
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (noteBusy || !noteText.trim()) ? 0.5 : 1 }}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {notes.length === 0 && <Text style={T.sub}>No notes yet.</Text>}
          {notes.map(n => (
            <View key={n.id} style={{ padding: 14, borderRadius: 16, backgroundColor: C.tile, gap: 6 }}>
              <Text style={T.body}>{n.body}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot size={8} color={colorForEmployee(n.author_email || n.author_name)} />
                <Text style={T.meta}>{n.author_name || 'Someone'} · {fmtDateTime(n.created_at)}</Text>
              </View>
            </View>
          ))}
        </Sheet>
      </KeyboardAvoidingView>
    </Screen>
  );
}
