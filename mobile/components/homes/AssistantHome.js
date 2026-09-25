import React from 'react';
import { View, Text, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { countRoutineItem } from '../../lib/api';
import { openAssistant } from '../../lib/nav';
import { C, T, F } from '../../lib/theme';
import { Tile, Label, Button, Progress, GradientChip } from '../ui';
import { firstName } from '../../lib/imsg';
import { AssistantPill, PlusOne, fmtTimeParts, plural } from './shared';
import LeadQuickAdd from './LeadQuickAdd';

// Naqiya's home: book the next slot with the assistant, today's route with
// directions, add a lead in one line, the counted outreach tasks, reminders.
const OFFICE = '23018 Undertaken Path, Katy';
const PROMPT_IN_PERSON = `Find the best in-person slots this week from ${OFFICE}, and pair them with what is already booked`;
const PROMPT_CALL = 'Find the best times for a call this week, and pair them with what is already booked';

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function AssistantHome({ navigation, home, me, tasks, reminders, updateHome }) {
  const go = (name, params) => navigation.navigate(name, params);
  const route = Array.isArray(home.route) ? home.route : null;
  const outreach = home.outreach || null;
  const targets = (outreach?.items || []).filter(it => Number(it.target) > 0);

  // +1 on a counted task: update the tile now, tell the server, put it back if that fails.
  const bump = async (it) => {
    const next = (Number(it.count) || 0) + 1;
    const set = (count) => updateHome(h => ({ ...h, outreach: { ...h.outreach, items: (h.outreach?.items || []).map(x => x.item_id === it.item_id ? { ...x, count } : x) } }));
    set(next);
    try { await countRoutineItem(it.routine_id, it.item_id, outreach.period_key, next); }
    catch (e) { set(it.count); Alert.alert('Could not update', e.message); }
  };

  // Reminders for me: due today (or earlier) and still open, then later ones.
  const today = dayKey(new Date());
  const mine = (reminders || []).filter(r => r.for_user === me?.id && r.status !== 'done');
  const dueToday = mine.filter(r => dayKey(new Date(r.remind_at)) <= today).length;
  const later = mine.length - dueToday;

  return (
    <>
      {/* Book next */}
      <Tile white style={{ gap: 12, backgroundColor: 'rgba(255,255,255,0.78)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Book next</Label>
          <AssistantPill />
        </View>
        <View style={{ gap: 3 }}>
          <Text style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>Find the next slot</Text>
          <Text style={T.sub}>Drive times from the office and pairing with what is booked</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <GradientChip label="In person this week" onPress={() => openAssistant({ prompt: PROMPT_IN_PERSON })} />
          <GradientChip label="Call this week" onPress={() => openAssistant({ prompt: PROMPT_CALL })} />
        </View>
      </Tile>

      {/* Today's route */}
      {route ? (
        <Tile onPress={() => go('Calendar')} style={{ gap: 12, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Today's route</Label>
            <Text style={T.meta}>{route.length ? plural(route.length, 'stop') : 'no stops'}</Text>
          </View>
          {route.length === 0 ? <Text style={T.sub}>Nothing on the road today. Tap to open the calendar.</Text> : null}
          {route.map((r, i) => {
            const t = fmtTimeParts(r.start_time);
            const who = (r.who || []).map(firstName).filter(Boolean).join(', ');
            return (
              <View key={r.id || `${r.start_time}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 12, lineHeight: 14, color: C.ink }}>{t.hm}</Text>
                  {t.ap ? <Text style={{ fontFamily: F.bold, fontSize: 9, lineHeight: 11, color: C.slate }}>{t.ap}</Text> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text numberOfLines={1} style={[T.title, { fontSize: 16 }]}>{r.title || '(no title)'}</Text>
                  <Text numberOfLines={1} style={T.sub}>{[who ? `with ${who}` : null, r.location].filter(Boolean).join(' · ') || 'No place set'}</Text>
                </View>
                {r.maps_url ? <Button label="Directions" small kind="white" onPress={() => Linking.openURL(r.maps_url)} /> : null}
              </View>
            );
          })}
        </Tile>
      ) : null}

      {/* Add a lead */}
      <LeadQuickAdd startCount={Number(outreach?.counters?.lead_created) || 0} />

      {/* Tasks · Assistant */}
      {outreach ? (
        <Tile onPress={() => go('Tasks')} style={{ gap: 10, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Tasks · Assistant</Label>
            <Text style={T.meta}>{tasks.total ? `${tasks.done} of ${tasks.total} done` : 'nothing on the list'}</Text>
          </View>
          {targets.length === 0 ? (
            <Text numberOfLines={1} style={T.sub}>{tasks.next ? `Next: ${tasks.next}` : 'No counted tasks today. Tap to open the list.'}</Text>
          ) : null}
          {targets.map(it => {
            const count = Number(it.count) || 0, target = Number(it.target);
            return (
              <View key={it.item_id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={[T.body, { fontFamily: F.semi, flex: 1 }]}>{it.text}</Text>
                  <Text style={[T.title, { fontSize: 15, color: count >= target ? C.green : C.ink }]}>{count} of {target}</Text>
                  <PlusOne onPress={() => bump(it)} label={`Add one to ${it.text}`} />
                </View>
                <Progress value={target ? count / target : 0} fill={count >= target ? C.green : C.ink} />
              </View>
            );
          })}
        </Tile>
      ) : null}

      {/* Reminders */}
      <Tile onPress={() => go('Tasks', { view: 'reminders' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-outline" size={20} color={C.ink} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={[T.title, { fontSize: 16 }]}>Reminders</Text>
          <Text numberOfLines={1} style={T.sub}>{mine.length ? [dueToday ? `${dueToday} today` : null, later ? `${later} coming up` : null].filter(Boolean).join(' · ') : 'Nothing set. Tell the assistant to remind you.'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.slate} />
      </Tile>
    </>
  );
}
