import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import Sheet from '../components/Sheet';
import LocationInput from '../components/LocationInput';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { getUpcomingMeetings, getPastMeetings, createMeeting, updateMeeting, deleteMeeting, getClients } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Chip, Button, Dot, Empty, DOCK_SPACE } from '../components/ui';
import DateField from '../components/DateField';

// Calendar (Aura): the month sits in one soft tile, the selected day's events
// are tiles below it, and the add button lives in the header.
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

export default function CalendarScreen({ navigation }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(dstr(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);   // the event being edited (tap a tile)

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
  const isToday = selected === dstr(new Date());
  const listTitle = isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const countLabel = dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? 'event' : 'events'}` : undefined;

  return (
    <Screen>
      <HeaderBar title="Calendar" sub={dateWords} onBack={() => navigation.goBack()}
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
          {dayItems.length === 0 && <Empty icon="calendar-outline" title="Nothing scheduled" sub="Tap the plus to add an appointment." />}
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

  // Tile fields: soft fill, no border. DateField takes the same look through its style prop.
  const input = { minHeight: 48, backgroundColor: C.tile, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink };
  const dateStyle = { backgroundColor: C.tile, borderWidth: 0, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 };
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
        <View style={{ flex: 1, minWidth: 0 }}><DateField value={date} onChange={setDate} style={dateStyle} /></View>
        <View style={{ width: 118 }}><DateField mode="time" value={time} onChange={setTime} style={dateStyle} /></View>
      </View>
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
