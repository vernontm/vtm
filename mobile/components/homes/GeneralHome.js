import React, { useMemo } from 'react';
import { View, Text, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, F } from '../../lib/theme';
import { Tile, Label, Avatar, Button, Dot, Progress } from '../ui';
import { last10 } from '../../lib/imsg';
import { fmtHM, fmtTime, mapsUrl } from './shared';

// The general home: the grid of live tiles everyone had before role homes.
// Each opens a space. Home loads the data and passes it down; the greeting
// header stays in HomeScreen.
const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const firstName = (user) => String(user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || '').split(/\s+/)[0];
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

export default function GeneralHome({ navigation, me, meetings, threads, directory, clients, time, tasks, now }) {
  const go = (name, params) => navigation.navigate(name, params);

  // Next meeting that has not ended yet.
  const nextUp = useMemo(() => {
    const t = Date.now();
    return (meetings || []).filter(m => new Date(m.end_time || m.start_time).getTime() >= t)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;
  }, [meetings]);

  const unreadThreads = useMemo(() => (threads || []).filter(t => (t.unread || 0) > 0), [threads]);
  const nameOf = (phone) => (directory || []).find(p => last10(p.phone) === last10(phone))?.name || phone;
  const leads = useMemo(() => (clients || []).filter(c => c.stage === 'lead'), [clients]);
  const hot = leads.filter(l => l.lead_temperature === 'hot').length;
  const warm = leads.filter(l => l.lead_temperature === 'warm').length;
  const activeClients = (clients || []).filter(c => c.stage !== 'lead').length;

  // Today's time: logged entries plus the running one.
  const today = dstr(new Date());
  const todayMin = (time?.entries || []).filter(e => e.work_date === today && e.minutes).reduce((s, e) => s + e.minutes, 0)
    + (time?.open ? Math.max(0, (now - new Date(time.open.started_at).getTime()) / 60000) : 0);

  // This week, Monday first, with a dot on days that have something.
  const week = useMemo(() => {
    const d = new Date(); const dow = (d.getDay() + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow); mon.setHours(0, 0, 0, 0);
    const days = {};
    (meetings || []).forEach(m => { const k = dstr(new Date(m.start_time)); days[k] = (days[k] || 0) + 1; });
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); const k = dstr(x); return { key: k, label: 'MTWTFSS'[i], day: x.getDate(), count: days[k] || 0, today: k === today, past: k < today }; });
  }, [meetings, today]);
  const weekCount = week.reduce((s, d) => s + d.count, 0);

  return (
    <>
      {/* Next up */}
      <Tile white onPress={() => go('Calendar')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.78)' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Label>Next up</Label>
          {nextUp ? (
            <>
              <Text style={[T.h3, { fontSize: 26, lineHeight: 28 }]}>{fmtTime(nextUp.start_time)}</Text>
              <Text numberOfLines={1} style={T.sub}>{nextUp.title || '(no title)'}{nextUp.location ? ` · ${nextUp.location}` : ''}</Text>
            </>
          ) : (
            <>
              <Text style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>Nothing scheduled</Text>
              <Text style={T.sub}>Tap to open the calendar</Text>
            </>
          )}
        </View>
        {nextUp?.meet_link ? <Button label="Join" small onPress={() => Linking.openURL(nextUp.meet_link)} /> : nextUp?.location ? (
          <Button label="Directions" small kind="soft" onPress={() => Linking.openURL(mapsUrl(nextUp.location))} />
        ) : null}
      </Tile>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {/* Inbox */}
        <Tile onPress={() => navigation.getParent()?.navigate('Inbox')} style={{ flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Label>Inbox</Label>{unreadThreads.length > 0 ? <Dot /> : null}</View>
          <View style={{ gap: 2 }}>
            <Text style={T.numeral}>{unreadThreads.length}</Text>
            <Text style={T.sub}>{unreadThreads.length === 1 ? 'unread text' : 'unread texts'}</Text>
          </View>
          <View style={{ flexDirection: 'row', height: 26 }}>
            {unreadThreads.slice(0, 3).map((t, i) => (
              <Avatar key={t.phone} name={nameOf(t.phone)} size={26} tone="white" style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: C.tile }} />
            ))}
          </View>
        </Tile>
        {/* Leads */}
        <Tile onPress={() => go('People', { tab: 'leads' })} style={{ flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 10 }}>
          <Label>Leads</Label>
          <View style={{ gap: 2 }}>
            <Text style={[T.numeral, { color: hot ? C.red : C.ink }]}>{hot || leads.length}</Text>
            <Text style={T.sub}>{hot ? `hot, waiting on you` : leads.length === 1 ? 'open lead' : 'open leads'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={C.amberDot} />
            <Text style={[T.meta, { color: C.amber }]}>{warm} warm</Text>
          </View>
        </Tile>
      </View>

      {/* Tasks */}
      <Tile onPress={() => go('Tasks')} style={{ gap: 8, paddingVertical: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Tasks</Label>
          <Text style={[T.title, { fontSize: 18 }]}>{tasks.total ? `${tasks.done} of ${tasks.total} done` : 'Nothing on the list'}</Text>
        </View>
        <Progress value={tasks.total ? tasks.done / tasks.total : 0} />
        <Text numberOfLines={1} style={T.sub}>{tasks.next ? `Next: ${tasks.next}` : tasks.total ? 'All done for today' : 'Add a task or set up a daily list'}</Text>
      </Tile>

      {/* Clock */}
      <Tile onPress={() => go('Time')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="time-outline" size={22} color={time?.open ? C.green : C.slate} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.h3, { fontSize: 22, lineHeight: 24 }]}>{fmtHM(todayMin)}</Text>
          <Text style={T.sub}>{time?.open ? `Clocked in since ${fmtTime(time.open.started_at)}` : 'Not clocked in'}</Text>
        </View>
        <Button label={time?.open ? 'Pause' : 'Start'} small kind={time?.open ? 'outline' : 'primary'} onPress={() => go('Time')} />
      </Tile>

      {/* This week */}
      <Tile onPress={() => go('Calendar')} style={{ gap: 10, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>This week</Label>
          <Text style={T.meta}>{weekCount} {weekCount === 1 ? 'event' : 'events'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {week.map(d => (
            <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
              <Text style={[T.meta, { fontSize: 11, color: d.today ? C.ink : C.slate }]}>{d.label}</Text>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: d.today ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: d.today ? F.bold : F.semi, fontSize: 15, color: d.today ? '#FFFFFF' : d.past ? C.slate : C.ink }}>{d.day}</Text>
              </View>
              <Dot size={5} color={d.count ? C.ink : 'transparent'} />
            </View>
          ))}
        </View>
      </Tile>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile onPress={() => go('People')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="people-outline" size={20} color={C.ink} />
          </View>
          <View style={{ flex: 1, gap: 1 }}><Text style={[T.title, { fontSize: 16 }]}>People</Text><Text style={T.sub}>{activeClients} active</Text></View>
        </Tile>
        <Tile onPress={() => go('Settings')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
          <Avatar name={firstName(me) || me?.email} size={40} tone="ink" />
          <View style={{ flex: 1, gap: 1 }}><Text style={[T.title, { fontSize: 16 }]}>Settings</Text><Text numberOfLines={1} style={T.sub}>{cap(firstName(me)) || ''}{me?.user_metadata?.is_admin || me?.app_metadata?.is_admin ? ' · Admin' : ''}</Text></View>
        </Tile>
      </View>
    </>
  );
}
