import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, T, F, GRAD } from '../../lib/theme';
import { Tile, Label, Button, Dot, initials } from '../ui';
import { colorForEmployee, firstName } from '../../lib/imsg';
import { routineRows, myTodos } from '../../lib/tasks';

// Shared pieces for the role homes: formatting, the Next up tile, the Team
// today tile, the small row tile, the +1 button, and the count-to-target
// helpers. Nothing here fetches; Home loads once and passes data down.

// Money reads as whole dollars: $1,234.
export const fmtMoney = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
// Minutes read as hours and minutes: 2h 10m, 38h, 45m.
export const fmtHM = (min) => {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
};
// VTM runs on Central time, so a tile reads the same wherever the phone is.
export const fmtTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); }
  catch (_) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
};
// "9:30" and "AM" as two parts, for the time avatars on the route.
export const fmtTimeParts = (iso) => {
  const s = fmtTime(iso);
  const m = s.match(/^(\d{1,2}:\d{2})\s*([AP]M)?/i);
  return m ? { hm: m[1], ap: (m[2] || '').toUpperCase() } : { hm: s, ap: '' };
};
// A date-only string (2026-10-01) is read as local noon so it never slips a day.
export const fmtDay = (v) => {
  if (!v) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T12:00:00` : v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const fmtAge = (hours) => {
  const h = Math.max(0, Math.round(Number(hours) || 0));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
export const mapsUrl = (location) => `https://maps.apple.com/?q=${encodeURIComponent(location)}`;

// The day's counters in words: "12 leads added · 1 meeting booked · 9 texts".
const COUNTER_WORDS = [
  ['lead_created', 'lead added', 'leads added'],
  ['meeting_created', 'meeting booked', 'meetings booked'],
  ['text_sent', 'text', 'texts'],
  ['chat_sent', 'chat', 'chats'],
];
export const countersInWords = (counters) => COUNTER_WORDS
  .filter(([k]) => Number(counters?.[k]) > 0)
  .map(([k, one, many]) => plural(Number(counters[k]), one, many))
  .join(' · ');

// Whether an event includes an email, whatever shape the API sent the guests in.
export const eventHasEmail = (m, email) => {
  const want = String(email || '').toLowerCase();
  if (!want) return false;
  const list = [...(Array.isArray(m?.attendees) ? m.attendees : []), ...(Array.isArray(m?.participants) ? m.participants : [])];
  return list.some(p => String((typeof p === 'string' ? p : p?.email) || '').toLowerCase() === want);
};

// ── Count-to-target ──
// Routine rows with their target and count. A target row is done when the
// count reaches the target; a plain tick (no count on the check row) still
// counts as done. lib/tasks.js only knows checkbox rows, so this sits here.
export function countedRows(routinesResp) {
  const checkMap = {};
  (routinesResp?.checks || []).forEach(c => { checkMap[`${c.item_id}@${c.period_key}`] = c; });
  const items = {};
  (routinesResp?.routines || []).forEach(r => (r.items || []).forEach(it => { items[`${r.id}:${it.id}`] = it; }));
  return routineRows(routinesResp).map(row => {
    const target = Number(items[row.id]?.target);
    if (!Number.isFinite(target) || target <= 0) return row;
    const check = checkMap[`${row.itemId}@${row.periodKey}`];
    const count = Number(check?.count) || 0;
    const done = check ? (check.count == null ? true : count >= target) : false;
    return { ...row, target, count, done };
  });
}

// Same numbers as lib/tasks.js todayProgress, with target rows counted right.
export function todayProgressWithTargets(routinesResp, todos, myId) {
  const rows = countedRows(routinesResp);
  const mine = myTodos(todos, myId);
  const total = rows.length + mine.length;
  const done = rows.filter(r => r.done).length + mine.filter(t => t.done).length;
  const next = rows.find(r => !r.done)?.text || mine.find(t => !t.done)?.title || null;
  return { total, done, next };
}

// ── Small primitives the homes share ──

// Round "+1" button. Ink on a tile, white on ink.
export function PlusOne({ onPress, onLongPress, size = 40, label = 'Add one', style }) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} accessibilityLabel={label} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#FFFFFF' }}>+1</Text>
    </TouchableOpacity>
  );
}

// Initials on the employee's own color (the roster color the inbox uses).
export function ColorAvatar({ id, name, size = 40, style }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colorForEmployee(id || name), alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontFamily: F.bold, fontSize: Math.round(size * 0.32), color: '#FFFFFF', letterSpacing: 0.3 }}>{initials(name)}</Text>
    </View>
  );
}

// The assistant's gradient pill (the one gradient in the app).
export function AssistantPill({ label = 'Assistant' }) {
  return (
    <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Ionicons name="sparkles" size={12} color="#FFFFFF" />
      <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#FFFFFF' }}>{label}</Text>
    </LinearGradient>
  );
}

// The row tile at the bottom of Home (People, Settings): icon circle, title, sub.
export function SmallTile({ icon, title, sub, onPress, dot, style }) {
  return (
    <Tile onPress={onPress} style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }, style]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={C.ink} />
        {dot ? <Dot size={10} style={{ position: 'absolute', top: 0, right: 0, borderWidth: 2, borderColor: C.tile, width: 12, height: 12, borderRadius: 6 }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={[T.title, { fontSize: 16 }]}>{title}</Text>
        <Text numberOfLines={1} style={T.sub}>{sub}</Text>
      </View>
    </Tile>
  );
}

// A white stat box inside a tile: a number over a word.
export function StatBox({ n, label }) {
  return (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#FFFFFF', gap: 1 }}>
      <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>{Number(n) || 0}</Text>
      <Text numberOfLines={1} style={T.meta}>{label}</Text>
    </View>
  );
}

// ── Shared tiles ──

// Next up: the white glass tile at the top of every role home. Opens the
// calendar; Join for a Meet link, Directions for a place.
export function NextUpTile({ label = 'Next up', event, sub, onPress }) {
  return (
    <Tile white onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.78)' }}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Label>{label}</Label>
        {event ? (
          <>
            <Text style={[T.h3, { fontSize: 26, lineHeight: 28 }]}>{fmtTime(event.start_time)}</Text>
            <Text numberOfLines={1} style={T.sub}>{event.title || '(no title)'}{event.location ? ` · ${event.location}` : ''}</Text>
          </>
        ) : (
          <>
            <Text style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>Nothing scheduled</Text>
            <Text style={T.sub}>Tap to open the calendar</Text>
          </>
        )}
        {sub ? <Text numberOfLines={1} style={[T.meta, { marginTop: 2 }]}>{sub}</Text> : null}
      </View>
      {event?.meet_link ? <Button label="Join" small onPress={() => Linking.openURL(event.meet_link)} /> : event?.location ? (
        <Button label="Directions" small kind="soft" onPress={() => Linking.openURL(mapsUrl(event.location))} />
      ) : null}
    </Tile>
  );
}

// Team today: one row per person with their color, hours today, the day's
// counters in words, and a dot that is green while they are clocked in.
// `action` adds a white button under the rows (HR's Approve time).
export function TeamTodayTile({ team, onPress, action }) {
  const people = team?.people || [];
  const weekSub = `${fmtHM(team?.week_minutes)} of ${fmtHM(team?.week_target_minutes || 3600)} this week`;
  return (
    <Tile onPress={onPress} style={{ gap: 12, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>Team today</Label>
        <Text style={T.meta}>{weekSub}</Text>
      </View>
      {people.length === 0 ? <Text style={T.sub}>Nobody has clocked in yet today.</Text> : null}
      {people.map(p => (
        <View key={p.user_id || p.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ColorAvatar id={p.user_id} name={p.name} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text numberOfLines={1} style={[T.title, { fontSize: 16 }]}>{firstName(p.name) || 'Teammate'}</Text>
            <Text numberOfLines={1} style={T.sub}>{countersInWords(p.counters) || (p.clocked_in ? 'Clocked in, nothing logged yet' : 'Nothing logged today')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[T.title, { fontSize: 14 }]}>{fmtHM(p.minutes_today)}</Text>
            <Dot color={p.clocked_in ? C.green : C.slate} />
          </View>
        </View>
      ))}
      {action ? (
        <View style={{ flexDirection: 'row' }}>
          <Button label={action.label} small kind="white" icon={action.icon} onPress={action.onPress} />
        </View>
      ) : null}
    </Tile>
  );
}
