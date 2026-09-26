import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, Platform, Keyboard } from 'react-native';
import Sheet from '../components/Sheet';
import LocationInput from '../components/LocationInput';
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getUpcomingMeetings, getPastMeetings, createMeeting, updateMeeting, deleteMeeting, getClients } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Chip, Button, Dot, Empty, DOCK_SPACE } from '../components/ui';

// Calendar (Aura): the month sits in one soft tile, the selected day's events
// are tiles below it, and the add button lives in the header.
// Every day and time on this screen is Central (America/Chicago) and reads as
// 12 hour with AM and PM, whatever zone the phone itself is set to.
const TZ = 'America/Chicago';
const pad = (n) => String(n).padStart(2, '0');

// The wall clock of an instant in Central. Falls back to the phone's own
// clock on an engine without formatToParts, so a format never throws.
function partsIn(date) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const x of f.formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value);
    if (!p.year) throw new Error('no parts');
    return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second || 0 };
  } catch (_) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
  }
}
// How far Central sits from UTC at that instant, in milliseconds.
const offsetAt = (ms) => {
  const p = partsIn(new Date(ms));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
// The Central calendar day an instant falls on: "2026-09-26".
const centralDay = (input) => {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  const p = partsIn(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
// Day-string maths anchored at UTC midnight, so a clock change never shifts it.
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day, n) => new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
// A Central wall clock (day plus minutes past midnight) as the real instant.
// Two passes so an event on a clock-change morning still lands right.
const centralInstant = (day, minutes) => {
  const [y, m, d] = String(day).split('-').map(Number);
  const wall = Date.UTC(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60, 0);
  let inst = wall - offsetAt(wall);
  inst = wall - offsetAt(inst);
  return new Date(inst);
};
// The same wall clock as a plain phone-local Date, only so the native picker
// shows those exact numbers on its wheels. It is never saved: the picker
// hands the numbers straight back through getHours and getDate, so nothing
// is converted twice.
const proxyDate = (day, minutes) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60, 0, 0);
};
// 12 hour with AM and PM: from an instant, or from minutes past midnight.
const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); };
const fmtClock = (minutes) => {
  const h24 = Math.floor(Math.max(0, minutes) / 60) % 24, mi = Math.max(0, minutes) % 60;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${pad(mi)} ${h24 < 12 ? 'AM' : 'PM'}`;
};
// A day string reads as words off a noon anchor, so no zone can move it.
const fmtDayLabel = (day) => { const d = new Date(`${day}T12:00:00`); return isNaN(d) ? String(day) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
const isBlock = (m) => m.all_day === true || (m.duration_minutes && m.duration_minutes >= 720) || /out of office|ooo|busy|unavailable|blocked/i.test(m.title || '');
const DURATIONS = [15, 30, 45, 60];
const fmtDur = (d) => (d >= 1380 ? 'All day' : d < 60 ? `${d}m` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`);
// Invitee emails on a meeting, whatever shape the API returned them in.
const emailsOf = (m) => (m?.participants || []).map(p => String((typeof p === 'string' ? p : p?.email) || '').toLowerCase()).filter(Boolean);
// Whether a meeting includes an email, reading both guest lists the API may send.
const includesEmail = (m, email) => {
  const list = [...(Array.isArray(m?.participants) ? m.participants : []), ...(Array.isArray(m?.attendees) ? m.attendees : [])];
  return list.some(p => String((typeof p === 'string' ? p : p?.email) || '').toLowerCase() === email);
};
// Alert.alert is a no-op on web, so the browser demo gets the browser dialogs.
const notify = (title, message) => (Platform.OS === 'web' ? window.alert([title, message].filter(Boolean).join('\n')) : Alert.alert(title, message));
const confirmDelete = (title, message, onYes) => {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onYes(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onYes }]);
};

// The month grid, rethemed light. The background matches the tile it sits in
// so the grid and its wrapper read as one soft tile.
const CAL_THEME = {
  calendarBackground: C.tile,
  dayTextColor: C.ink,
  monthTextColor: C.ink,
  textDisabledColor: '#B9BBC6',
  todayTextColor: C.ink,
  todayBackgroundColor: '#FFFFFF',
  arrowColor: C.ink,
  textSectionTitleColor: C.slate,
  selectedDayBackgroundColor: C.ink,
  selectedDayTextColor: '#FFFFFF',
  dotColor: C.ink,
  selectedDotColor: '#FFFFFF',
  textDayFontFamily: F.semi,
  textMonthFontFamily: F.displayBold,
  textDayHeaderFontFamily: F.bold,
  textDayFontSize: 15,
  textMonthFontSize: 17,
  textDayHeaderFontSize: 11,
};

export default function CalendarScreen({ navigation, route }) {
  // The sales home opens the calendar with role 'sales': only events that
  // include the signed-in person's email show.
  const mineOnly = route?.params?.role === 'sales';
  const [myEmail, setMyEmail] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(centralDay(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);   // the event being edited (tap a tile)

  useEffect(() => {
    if (!mineOnly) return;
    supabase.auth.getUser().then(({ data: { user } }) => setMyEmail(String(user?.email || '').toLowerCase())).catch(() => setMyEmail(''));
  }, [mineOnly]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [up, past] = await Promise.all([getUpcomingMeetings(), getPastMeetings().catch(() => [])]);
      setMeetings([...(past || []), ...(up || [])]);
    } catch (e) { notify('Could not load calendar', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // What this person sees: everything, or only the events they are on.
  const visible = useMemo(() => (mineOnly ? (myEmail ? meetings.filter(m => includesEmail(m, myEmail)) : []) : meetings), [meetings, mineOnly, myEmail]);

  // Meetings bucketed per Central day (blocks span every day they cover).
  const byDay = useMemo(() => {
    const map = {};
    for (const m of visible) {
      const startDay = centralDay(m.start_time);
      if (!startDay) continue;
      let spanDays = 0;
      if (isBlock(m)) {
        const start = new Date(m.start_time);
        const end = new Date(m.end_time || m.start_time);
        const endAdj = end > start ? new Date(end.getTime() - 1) : end;
        spanDays = Math.min(Math.max(0, daysBetween(startDay, centralDay(endAdj))), 62);
      }
      for (let i = 0; i <= spanDays; i++) { const day = addDays(startDay, i); (map[day] = map[day] || []).push(m); }
    }
    Object.values(map).forEach(a => a.sort((x, y) => new Date(x.start_time) - new Date(y.start_time)));
    return map;
  }, [visible]);

  const marked = useMemo(() => {
    const out = {};
    for (const [day, items] of Object.entries(byDay)) {
      const hasMeeting = items.some(m => !isBlock(m));
      const hasBlock = items.some(isBlock);
      out[day] = {
        dots: [hasMeeting && { key: 'm', color: C.ink }, hasBlock && { key: 'b', color: C.amberDot }].filter(Boolean),
      };
    }
    out[selected] = { ...(out[selected] || {}), selected: true, selectedColor: C.ink };
    return out;
  }, [byDay, selected]);

  const dayItems = byDay[selected] || [];
  const closeSheet = () => { setShowNew(false); setEditing(null); };
  const selectedDate = new Date(selected + 'T12:00:00');
  const dateWords = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isToday = selected === centralDay(new Date());
  const listTitle = isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const countLabel = dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? 'event' : 'events'}` : undefined;

  return (
    <Screen>
      <HeaderBar title="Calendar" sub={mineOnly ? `${dateWords} · Your events only` : dateWords} onBack={() => navigation.goBack()}
        right={<IconButton icon="add" dark label="New appointment" onPress={() => setShowNew(true)} />} />
      {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
        <Tile style={{ padding: 8 }}>
          <Calendar
            markingType="multi-dot"
            markedDates={marked}
            onDayPress={(d) => setSelected(d.dateString)}
            theme={CAL_THEME}
            style={{ backgroundColor: C.tile, borderRadius: 16 }}
          />
        </Tile>

        <View style={{ gap: 10 }}>
          <Label right={countLabel}>{listTitle}</Label>
          {dayItems.length === 0 && <Empty icon="calendar-outline" title="Nothing scheduled" sub={mineOnly ? 'Only events that include your email show here. Tap the plus to add one.' : 'Tap the plus to add an appointment.'} />}
          {dayItems.map(m => {
            const block = isBlock(m);
            const when = block && m.duration_minutes >= 1380 ? 'All day' : `${fmtTime(m.start_time)} to ${fmtTime(m.end_time || m.start_time)}`;
            const where = m.location ? ` · ${m.location}` : m.meet_link ? ' · Google Meet' : '';
            return (
              <Tile key={`${m.id}-${selected}`} onPress={() => setEditing(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                {block ? <Dot color={C.amberDot} size={10} /> : null}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={2} style={T.title}>{m.title || '(no title)'}</Text>
                  <Text numberOfLines={1} style={T.sub}>{when}{where}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.slate} />
              </Tile>
            );
          })}
        </View>
      </ScrollView>
      )}

      <AppointmentSheet visible={showNew || !!editing} meeting={editing} defaultDate={selected}
        onClose={closeSheet} onSaved={() => { closeSheet(); load(true); }} />
    </Screen>
  );
}

// One sheet for both jobs: blank on the selected day to create, pre-filled from
// an event to edit it (title, date/time, length, place, invitee) or delete it.
function AppointmentSheet({ visible, defaultDate, meeting, onClose, onSaved }) {
  const editing = !!meeting;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);          // the Central day, YYYY-MM-DD
  const [minutes, setMinutes] = useState(600);            // minutes past midnight Central (10:00 AM)
  const [picking, setPicking] = useState(null);           // null | 'date' | 'time'
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
    setPicking(null);
    if (meeting) {
      const start = new Date(meeting.start_time);
      const end = meeting.end_time ? new Date(meeting.end_time) : null;
      const p = partsIn(start);
      setTitle(meeting.title || '');
      setDate(centralDay(start));
      setMinutes(p.hour * 60 + p.minute);
      setDuration(meeting.duration_minutes || (end ? Math.max(5, Math.round((end - start) / 60000)) : 30));
      setKind(meeting.location ? 'in_person' : 'online');
      setLocation(meeting.location || '');
      setAttendee(emailsOf(meeting)[0] || '');
    } else {
      setTitle(''); setDate(defaultDate); setMinutes(600); setDuration(30);
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

  // Tile fields: soft fill, no border. The when fields take the same look.
  const input = { minHeight: 48, backgroundColor: C.tile, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink };
  const dateStyle = { backgroundColor: C.tile, borderWidth: 0, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 };
  // An existing event may have a length that is not one of the presets.
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  // One picker panel, full width, below the two fields. It stays mounted for
  // as long as it is open, so a wheel keeps its place instead of closing
  // itself on the first turn, and it never gets squeezed into a narrow column.
  const pickerValue = React.useMemo(() => proxyDate(date, minutes), [date, minutes]);
  const openPicker = (which) => { Keyboard.dismiss(); setShowSug(false); setPicking(p => (p === which ? null : which)); };
  // iOS reports every turn of the wheel, Android reports once on OK. Only the
  // picker moves the value, and only Done (or OK, or Cancel) closes the panel.
  const onPick = (event, picked) => {
    if (Platform.OS !== 'ios') setPicking(null);
    if (!picked) return;
    if (picking === 'time') setMinutes(picked.getHours() * 60 + picked.getMinutes());
    else setDate(`${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`);
  };
  // The browser demo has no native picker, so it gets the built-in date and
  // time inputs; the phone gets the wheels. Plain functions, not inner
  // components, so the fields around them never lose focus on a re-render.
  const webWhen = (which, style) => (
    <View style={[{ minWidth: 0 }, style]}>
      <input type={which} value={which === 'time' ? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` : date}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (which === 'time') { const [h, mi] = v.split(':').map(Number); setMinutes((h || 0) * 60 + (mi || 0)); }
          else setDate(v);
        }}
        style={{ background: C.tile, border: 0, borderRadius: 16, padding: '14px 16px', fontSize: 16, color: C.ink, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
    </View>
  );
  const whenField = (which, icon, label, style) => (Platform.OS === 'web' ? webWhen(which, style) : (
    <TouchableOpacity onPress={() => openPicker(which)} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={which === 'time' ? `Start time, ${label}` : `Date, ${label}`}
      style={[dateStyle, { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50 }, picking === which ? { backgroundColor: C.tile2 } : null, style]}>
      <Ionicons name={icon} size={16} color={C.slate} />
      <Text numberOfLines={1} style={[T.body, { fontFamily: F.semi, flexShrink: 1 }]}>{label}</Text>
    </TouchableOpacity>
  ));
  const pickerPanel = () => {
    if (!picking || Platform.OS === 'web') return null;
    if (Platform.OS !== 'ios') return <DateTimePicker value={pickerValue} mode={picking} display="default" is24Hour={false} onValueChange={onPick} onDismiss={() => setPicking(null)} />;
    return (
      <View style={{ backgroundColor: C.tile, borderRadius: 20, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
          <Label style={{ flex: 1 }}>{picking === 'time' ? 'Start time · Central' : 'Date'}</Label>
          <Button label="Done" small kind="white" onPress={() => setPicking(null)} />
        </View>
        <DateTimePicker value={pickerValue} mode={picking} display="spinner" locale="en-US" themeVariant="light" textColor={C.ink}
          onValueChange={onPick} onDismiss={() => setPicking(null)} style={{ alignSelf: 'stretch', height: 216 }} />
      </View>
    );
  };

  const save = async () => {
    if (!title.trim()) return notify('Add a title');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(minutes)) return notify('Check the date and time', 'Tap the date or the time to pick one.');
    if (kind === 'in_person' && !location.trim()) return notify('Add the address for an in-person meeting');
    setBusy(true);
    try {
      // What Ray picked is a Central wall clock; this is that exact instant.
      const start = centralInstant(date, minutes);
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

  return (
    <Sheet visible={visible} title={editing ? 'Edit event' : 'New appointment'} onClose={onClose}>
      <TextInput style={input} placeholder="Title" placeholderTextColor={C.slate} value={title} onChangeText={setTitle} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Online" icon="videocam-outline" active={kind === 'online'} onPress={() => setKind('online')} />
        <Chip label="In person" icon="location-outline" active={kind === 'in_person'} onPress={() => setKind('in_person')} />
      </View>
      {kind === 'in_person' && <LocationInput style={input} placeholder="Business or address" value={location} onChange={setLocation} />}
      {editing && meeting?.meet_link ? <Text style={T.sub}>The Google Meet link stays on the invite.</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {whenField('date', 'calendar-outline', fmtDayLabel(date), { flex: 1, minWidth: 0 })}
        {whenField('time', 'time-outline', fmtClock(minutes), { width: 132 })}
      </View>
      {pickerPanel()}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {durations.map(d => (
          <Chip key={d} label={fmtDur(d)} active={duration === d} onPress={() => setDuration(d)} />
        ))}
      </View>
      <TextInput style={input} placeholder="Invitee: search clients and leads, or type an email" placeholderTextColor={C.slate} autoCapitalize="none" keyboardType="email-address" value={attendee}
        onChangeText={(v) => { setAttendee(v); setShowSug(true); }} onFocus={() => setShowSug(true)} />
      {showSug && suggestions.length > 0 && (
        <View style={{ backgroundColor: C.tile, borderRadius: 16, marginTop: -4, overflow: 'hidden' }}>
          {suggestions.map((c, i) => (
            <TouchableOpacity key={c.id} onPress={() => { setAttendee(c.contact_email); setShowSug(false); }} activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[T.body, { fontFamily: F.bold }]}>{c.business_name || c.owner_name}</Text>
                <Text numberOfLines={1} style={T.sub}>{c.contact_email}</Text>
              </View>
              <Text style={[T.meta, { color: c.stage === 'lead' ? C.amber : C.green }]}>{c.stage === 'lead' ? 'Lead' : 'Client'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {editing ? (
          <Button label="Delete" kind="danger" onPress={remove} disabled={busy} style={{ flex: 1, height: 50, borderRadius: 25 }} />
        ) : (
          <Button label="Cancel" kind="soft" onPress={onClose} style={{ flex: 1, height: 50, borderRadius: 25 }} />
        )}
        <Button label={editing ? 'Save changes' : `Create${kind === 'online' ? ' + Meet link' : ''}`} onPress={save} busy={busy} style={{ flex: 2, height: 50, borderRadius: 25 }} />
      </View>
    </Sheet>
  );
}
