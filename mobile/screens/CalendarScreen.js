import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import Sheet from '../components/Sheet';
import HeaderButton from '../components/HeaderButton';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { getUpcomingMeetings, getPastMeetings, createMeeting, updateMeeting, deleteMeeting, getClients } from '../lib/api';
import { C, card } from '../lib/theme';
import DateField from '../components/DateField';

const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const isBlock = (m) => m.all_day === true || (m.duration_minutes && m.duration_minutes >= 720) || /out of office|ooo|busy|unavailable|blocked/i.test(m.title || '');
const DURATIONS = [15, 30, 45, 60];
const fmtDur = (d) => (d >= 1380 ? 'All day' : d < 60 ? `${d}m` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`);
// Invitee emails on a meeting, whatever shape the API returned them in.
const emailsOf = (m) => (m?.participants || []).map(p => String((typeof p === 'string' ? p : p?.email) || '').toLowerCase()).filter(Boolean);
// Alert.alert is a no-op on web, so the browser demo gets the browser dialogs.
const notify = (title, message) => (Platform.OS === 'web' ? window.alert([title, message].filter(Boolean).join('\n')) : Alert.alert(title, message));
const confirmDelete = (title, message, onYes) => {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onYes(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onYes }]);
};

export default function CalendarScreen({ navigation }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(dstr(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);   // the event being edited (tap a card)

  // iOS-style: the add button lives in the header instead of floating over the page.
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <HeaderButton icon="add" label="New appointment" onPress={() => setShowNew(true)} /> });
  }, [navigation]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [up, past] = await Promise.all([getUpcomingMeetings(), getPastMeetings().catch(() => [])]);
      setMeetings([...(past || []), ...(up || [])]);
    } catch (e) { notify('Could not load calendar', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Meetings bucketed per local day (blocks span every day they cover).
  const byDay = useMemo(() => {
    const map = {};
    for (const m of meetings) {
      const start = new Date(m.start_time);
      const end = new Date(m.end_time || m.start_time);
      const endAdj = end > start ? new Date(end.getTime() - 1) : end;
      const spanDays = isBlock(m) ? Math.min(Math.max(0, Math.round((new Date(endAdj.getFullYear(), endAdj.getMonth(), endAdj.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000)), 62) : 0;
      const d = new Date(start);
      for (let i = 0; i <= spanDays; i++) { (map[dstr(d)] = map[dstr(d)] || []).push(m); d.setDate(d.getDate() + 1); }
    }
    Object.values(map).forEach(a => a.sort((x, y) => new Date(x.start_time) - new Date(y.start_time)));
    return map;
  }, [meetings]);

  const marked = useMemo(() => {
    const out = {};
    for (const [day, items] of Object.entries(byDay)) {
      const hasMeeting = items.some(m => !isBlock(m));
      const hasBlock = items.some(isBlock);
      out[day] = {
        dots: [hasMeeting && { key: 'm', color: C.blue }, hasBlock && { key: 'b', color: C.amber }].filter(Boolean),
      };
    }
    out[selected] = { ...(out[selected] || {}), selected: true, selectedColor: C.blue };
    return out;
  }, [byDay, selected]);

  const dayItems = byDay[selected] || [];
  const closeSheet = () => { setShowNew(false); setEditing(null); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {loading ? <ActivityIndicator color={C.blue} style={{ marginTop: 40 }} /> : (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />}>
        <Calendar
          markingType="multi-dot"
          markedDates={marked}
          onDayPress={(d) => setSelected(d.dateString)}
          theme={{
            calendarBackground: C.bg, dayTextColor: C.text, monthTextColor: C.text,
            textDisabledColor: '#4a4a52', todayTextColor: C.blue, arrowColor: C.blue,
            textSectionTitleColor: C.muted, selectedDayBackgroundColor: C.blue, selectedDayTextColor: '#fff',
          }}
        />
        <View style={{ padding: 16, gap: 10 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>
            {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          {dayItems.length === 0 && <Text style={{ color: C.muted, fontSize: 14 }}>Nothing scheduled.</Text>}
          {dayItems.map(m => {
            const block = isBlock(m);
            return (
              <TouchableOpacity key={`${m.id}-${selected}`} activeOpacity={0.7} onPress={() => setEditing(m)} accessibilityLabel={`Edit ${m.title || 'event'}`}
                style={[card, { padding: 14, borderLeftWidth: 3, borderLeftColor: block ? C.amber : C.blue }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {block && <Ionicons name="remove-circle" size={15} color={C.amber} />}
                  <Text numberOfLines={2} style={{ color: block ? C.amber : C.text, fontWeight: '700', fontSize: 15, flex: 1 }}>{m.title || '(no title)'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.muted} />
                </View>
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>
                  {block && m.duration_minutes >= 1380 ? 'All day' : `${fmtTime(m.start_time)} to ${fmtTime(m.end_time || m.start_time)}`}
                  {m.location ? ` · ${m.location}` : m.meet_link ? ' · Google Meet' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 110 }} />
      </ScrollView>
      )}

      <AppointmentSheet visible={showNew || !!editing} meeting={editing} defaultDate={selected}
        onClose={closeSheet} onSaved={() => { closeSheet(); load(true); }} />
    </View>
  );
}

// One sheet for both jobs: blank on the selected day to create, pre-filled from
// an event to edit it (title, date/time, length, place, invitee) or delete it.
function AppointmentSheet({ visible, defaultDate, meeting, onClose, onSaved }) {
  const editing = !!meeting;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(30);
  const [kind, setKind] = useState('online');   // online | in_person
  const [location, setLocation] = useState('');
  const [attendee, setAttendee] = useState('');
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [showSug, setShowSug] = useState(false);

  // Seed the form each time it opens.
  useEffect(() => {
    if (!visible) return;
    setShowSug(false);
    if (meeting) {
      const start = new Date(meeting.start_time);
      const end = meeting.end_time ? new Date(meeting.end_time) : null;
      setTitle(meeting.title || '');
      setDate(dstr(start));
      setTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      setDuration(meeting.duration_minutes || (end ? Math.max(5, Math.round((end - start) / 60000)) : 30));
      setKind(meeting.location ? 'in_person' : 'online');
      setLocation(meeting.location || '');
      setAttendee(emailsOf(meeting)[0] || '');
    } else {
      setTitle(''); setDate(defaultDate); setTime('10:00'); setDuration(30);
      setKind('online'); setLocation(''); setAttendee('');
    }
  }, [visible, meeting?.id, defaultDate]);

  // Load clients + leads once per open, for the invitee picker.
  useEffect(() => {
    if (!visible || contacts.length) return;
    getClients().then(rows => setContacts((rows || []).filter(c => c.contact_email))).catch(() => {});
  }, [visible]);

  const suggestions = React.useMemo(() => {
    const needle = attendee.trim().toLowerCase();
    if (!needle || needle.length < 2) return [];
    return contacts.filter(c =>
      (c.business_name || '').toLowerCase().includes(needle) ||
      (c.owner_name || '').toLowerCase().includes(needle) ||
      (c.contact_email || '').toLowerCase().includes(needle)
    ).slice(0, 5);
  }, [attendee, contacts]);

  const input = { backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: C.text };
  // An existing event may have a length that is not one of the presets.
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  const save = async () => {
    if (!title.trim()) return notify('Add a title');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return notify('Check the date and time', 'Date as YYYY-MM-DD, time as HH:MM (24h).');
    if (kind === 'in_person' && !location.trim()) return notify('Add the address for an in-person meeting');
    setBusy(true);
    try {
      const [h, mi] = time.split(':');
      const start = new Date(`${date}T${pad(parseInt(h, 10))}:${pad(parseInt(mi, 10))}:00`);
      const end = new Date(start.getTime() + duration * 60000);
      const email = attendee.trim().toLowerCase();
      const loc = kind === 'in_person' ? location.trim() : '';
      if (editing) {
        const patch = { title: title.trim(), start_time: start.toISOString(), end_time: end.toISOString(), location: loc };
        // Only touch the invite list when the invitee changed; other guests stay.
        const was = emailsOf(meeting);
        if (email !== (was[0] || '')) patch.attendees = [...(email ? [email] : []), ...was.slice(1)];
        await updateMeeting(meeting.id, patch);
      } else {
        await createMeeting({
          summary: title.trim(), start: start.toISOString(), end: end.toISOString(),
          attendees: email ? [email] : [],
          addMeetLink: kind === 'online', location: loc,
          reminderMinutes: 10,
        });
      }
      onSaved();
    } catch (e) { notify(editing ? 'Could not save' : 'Could not create', e.message); }
    finally { setBusy(false); }
  };

  const remove = () => confirmDelete('Delete this event?', `"${meeting?.title || 'Untitled'}" will be removed from the calendar for everyone invited.`, async () => {
    setBusy(true);
    try { await deleteMeeting(meeting.id); onSaved(); }
    catch (e) { notify('Could not delete', e.message); }
    finally { setBusy(false); }
  });

  const chip = (on) => ({ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.blueSoft : C.surface2 });

  return (
    <Sheet visible={visible} title={editing ? 'Edit event' : 'New appointment'} onClose={onClose}>
          <TextInput style={input} placeholder="Title" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={chip(kind === 'online')} onPress={() => setKind('online')}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="videocam-outline" size={15} color={kind === 'online' ? C.blue : C.muted} /><Text style={{ color: kind === 'online' ? C.blue : C.muted, fontWeight: '700' }}>Online</Text></View></TouchableOpacity>
            <TouchableOpacity style={chip(kind === 'in_person')} onPress={() => setKind('in_person')}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="location-outline" size={15} color={kind === 'in_person' ? C.blue : C.muted} /><Text style={{ color: kind === 'in_person' ? C.blue : C.muted, fontWeight: '700' }}>In person</Text></View></TouchableOpacity>
          </View>
          {kind === 'in_person' && <TextInput style={input} placeholder="Address" placeholderTextColor={C.muted} value={location} onChangeText={setLocation} />}
          {editing && meeting?.meet_link ? <Text style={{ color: C.muted, fontSize: 12.5 }}>The Google Meet link stays on the invite.</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><DateField value={date} onChange={setDate} /></View>
            <View style={{ width: 110 }}><DateField mode="time" value={time} onChange={setTime} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {durations.map(d => (
              <TouchableOpacity key={d} style={chip(duration === d)} onPress={() => setDuration(d)}>
                <Text style={{ color: duration === d ? C.blue : C.muted, fontWeight: '700' }}>{fmtDur(d)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={input} placeholder="Invitee: search clients/leads or type an email" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" value={attendee}
            onChangeText={(v) => { setAttendee(v); setShowSug(true); }} onFocus={() => setShowSug(true)} />
          {showSug && suggestions.length > 0 && (
            <View style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, marginTop: -6 }}>
              {suggestions.map(c => (
                <TouchableOpacity key={c.id} onPress={() => { setAttendee(c.contact_email); setShowSug(false); }}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.text, fontWeight: '700', fontSize: 13.5 }}>{c.business_name || c.owner_name}</Text>
                    <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12 }}>{c.contact_email}</Text>
                  </View>
                  <Text style={{ color: c.stage === 'lead' ? C.amber : C.green, fontSize: 10.5, fontWeight: '800' }}>
                    {c.stage === 'lead' ? 'LEAD' : 'CLIENT'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 }}>
            {editing ? (
              <TouchableOpacity onPress={remove} disabled={busy} accessibilityLabel="Delete event" style={{ flex: 1, borderWidth: 1, borderColor: `${C.red}88`, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
                <Text style={{ color: C.red, fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onClose} style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={save} disabled={busy} style={{ flex: 2, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>{editing ? 'Save changes' : `Create${kind === 'online' ? ' + Meet link' : ''}`}</Text>
              )}
            </TouchableOpacity>
          </View>
    </Sheet>
  );
}
