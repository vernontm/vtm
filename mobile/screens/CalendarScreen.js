import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import Sheet from '../components/Sheet';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { getUpcomingMeetings, getPastMeetings, createMeeting, getClients } from '../lib/api';
import { C, card } from '../lib/theme';
import DateField from '../components/DateField';

const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const isBlock = (m) => m.all_day === true || (m.duration_minutes && m.duration_minutes >= 720) || /out of office|ooo|busy|unavailable|blocked/i.test(m.title || '');

export default function CalendarScreen() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(dstr(new Date()));
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [up, past] = await Promise.all([getUpcomingMeetings(), getPastMeetings().catch(() => [])]);
      setMeetings([...(past || []), ...(up || [])]);
    } catch (e) { Alert.alert('Could not load calendar', e.message); }
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
              <View key={`${m.id}-${selected}`} style={[card, { padding: 14, borderLeftWidth: 3, borderLeftColor: block ? C.amber : C.blue }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {block && <Ionicons name="remove-circle" size={15} color={C.amber} />}
                  <Text style={{ color: block ? C.amber : C.text, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{m.title || '(no title)'}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>
                  {block && m.duration_minutes >= 1380 ? 'All day' : `${fmtTime(m.start_time)} to ${fmtTime(m.end_time || m.start_time)}`}
                  {m.location ? ` · ${m.location}` : m.meet_link ? ' · Google Meet' : ''}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={{ height: 90 }} />
      </ScrollView>
      )}

      <TouchableOpacity onPress={() => setShowNew(true)}
        style={{ position: 'absolute', bottom: 24, right: 20, backgroundColor: C.blue, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 }}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      <NewAppointment visible={showNew} defaultDate={selected} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(true); }} />
    </View>
  );
}

function NewAppointment({ visible, defaultDate, onClose, onCreated }) {
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

  useEffect(() => { if (visible) setDate(defaultDate); }, [visible, defaultDate]);
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

  const save = async () => {
    if (!title.trim()) return Alert.alert('Add a title');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return Alert.alert('Check the date and time', 'Date as YYYY-MM-DD, time as HH:MM (24h).');
    if (kind === 'in_person' && !location.trim()) return Alert.alert('Add the address for an in-person meeting');
    setBusy(true);
    try {
      const [h, mi] = time.split(':');
      const start = new Date(`${date}T${pad(parseInt(h, 10))}:${pad(parseInt(mi, 10))}:00`);
      const end = new Date(start.getTime() + duration * 60000);
      await createMeeting({
        summary: title.trim(), start: start.toISOString(), end: end.toISOString(),
        attendees: attendee.trim() ? [attendee.trim().toLowerCase()] : [],
        addMeetLink: kind === 'online', location: kind === 'in_person' ? location.trim() : '',
        reminderMinutes: 10,
      });
      setTitle(''); setAttendee(''); setLocation('');
      onCreated();
    } catch (e) { Alert.alert('Could not create', e.message); }
    finally { setBusy(false); }
  };

  const chip = (on) => ({ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.blueSoft : C.surface2 });

  return (
    <Sheet visible={visible} title="New appointment" onClose={onClose}>
          <TextInput style={input} placeholder="Title" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={chip(kind === 'online')} onPress={() => setKind('online')}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="videocam-outline" size={15} color={kind === 'online' ? C.blue : C.muted} /><Text style={{ color: kind === 'online' ? C.blue : C.muted, fontWeight: '700' }}>Online</Text></View></TouchableOpacity>
            <TouchableOpacity style={chip(kind === 'in_person')} onPress={() => setKind('in_person')}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="location-outline" size={15} color={kind === 'in_person' ? C.blue : C.muted} /><Text style={{ color: kind === 'in_person' ? C.blue : C.muted, fontWeight: '700' }}>In person</Text></View></TouchableOpacity>
          </View>
          {kind === 'in_person' && <TextInput style={input} placeholder="Address" placeholderTextColor={C.muted} value={location} onChangeText={setLocation} />}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><DateField value={date} onChange={setDate} /></View>
            <View style={{ width: 110 }}><DateField mode="time" value={time} onChange={setTime} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[15, 30, 45, 60].map(d => (
              <TouchableOpacity key={d} style={chip(duration === d)} onPress={() => setDuration(d)}>
                <Text style={{ color: duration === d ? C.blue : C.muted, fontWeight: '700' }}>{d}m</Text>
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
            <TouchableOpacity onPress={onClose} style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: C.muted, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={busy} style={{ flex: 2, backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Create{kind === 'online' ? ' + Meet link' : ''}</Text>}
            </TouchableOpacity>
          </View>
    </Sheet>
  );
}
