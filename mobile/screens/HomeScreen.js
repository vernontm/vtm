import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { getHome, getUpcomingMeetings, getPastMeetings, getImsgThreads, getImsgDirectory, getClients, getTimeEntries, getRoutines, getTeamTodos, getReminders } from '../lib/api';
import { C, T } from '../lib/theme';
import { Screen, Avatar, DOCK_SPACE } from '../components/ui';
import { setInboxUnread, unreadOf } from '../lib/inboxBadge';
import GeneralHome from '../components/homes/GeneralHome';
import CeoHome from '../components/homes/CeoHome';
import HrHome from '../components/homes/HrHome';
import AssistantHome from '../components/homes/AssistantHome';
import SalesHome from '../components/homes/SalesHome';
import { todayProgressWithTargets } from '../components/homes/shared';

// Home: the greeting, then the home for who you are. The server resolves the
// role on /home (an admin's pick in Settings, else the roster title); the
// general tiles stay for everyone else, and for anyone whose /home cannot
// answer. Everything loads together and refreshes on focus or a pull.
const HOMES = { ceo: CeoHome, hr: HrHome, assistant: AssistantHome, sales: SalesHome };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const firstName = (user) => String(user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || '').split(/\s+/)[0];
const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState(null);
  const [home, setHome] = useState(null);       // the /home reply, or null for the general tiles
  const [meetings, setMeetings] = useState([]);
  const [threads, setThreads] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [clients, setClients] = useState([]);
  const [time, setTime] = useState({ entries: [], open: null });
  const [tasks, setTasks] = useState({ total: 0, done: 0, next: null });
  const [reminders, setReminders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {}); }, []);

  const load = useCallback(async (quiet) => {
    if (quiet) setRefreshing(true);
    const [hm, up, past, th, dir, cl, tm, rt, td, rm] = await Promise.allSettled([
      getHome(), getUpcomingMeetings(), getPastMeetings(), getImsgThreads(), getImsgDirectory(), getClients(), getTimeEntries(me?.id), getRoutines(), getTeamTodos(), getReminders(),
    ]);
    const ok = (r) => (r.status === 'fulfilled' ? r.value : null);
    // No answer from /home (offline, or the migration still pending) leaves
    // whatever home was showing, which is the general tiles at first.
    const h = ok(hm);
    if (h && typeof h === 'object' && h.role) setHome(h);
    setMeetings([...(ok(past) || []), ...(ok(up) || [])]);
    if (ok(th)) { setThreads(ok(th)); setInboxUnread(unreadOf(ok(th))); }
    if (ok(dir)) setDirectory(ok(dir));
    if (ok(cl)) setClients(ok(cl));
    if (ok(tm)) setTime(ok(tm));
    setTasks(todayProgressWithTargets(ok(rt), ok(td), me?.id));
    setReminders(ok(rm)?.reminders || []);
    setNow(Date.now());
    setRefreshing(false);
  }, [me?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    if (!time.open) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [time.open]);

  const role = home?.role && HOMES[home.role] ? home.role : 'general';
  const RoleHome = HOMES[role] || null;

  // "n things need you", per role: what is held up or waiting for review,
  // hot leads, unread texts, an outreach count still short of its target.
  const unread = useMemo(() => threads.filter(t => (t.unread || 0) > 0).length, [threads]);
  const hot = useMemo(() => clients.filter(c => c.stage === 'lead' && c.lead_temperature === 'hot').length, [clients]);
  const needs = useMemo(() => {
    const openOutreach = (home?.outreach?.items || []).some(i => Number(i.target) > 0 && (Number(i.count) || 0) < Number(i.target)) ? 1 : 0;
    const openTasks = tasks.total - tasks.done > 0 ? 1 : 0;
    if (role === 'ceo') return (home.held_up?.length || 0) + unread;
    if (role === 'hr') return (home.review_queue?.length || 0) + unread;
    if (role === 'assistant') return unread + (Number(home.leads?.hot) || 0) + openOutreach;
    if (role === 'sales') return (Number(home.leads?.hot) || 0) + unread + openOutreach;
    return unread + hot + openTasks;
  }, [role, home, unread, hot, tasks]);

  const name = cap(firstName(me)) || cap(String(home?.me?.name || '').split(/\s+/)[0]);
  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const needsLine = needs === 0 ? 'nothing waiting on you' : `${needs} thing${needs === 1 ? '' : 's'} need${needs === 1 ? 's' : ''} you`;

  return (
    <Screen aurora>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: DOCK_SPACE, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={T.h1}>{greeting()}{name ? `, ${name}` : ''}</Text>
            <Text style={T.sub}>{dateLine} · {needsLine}</Text>
          </View>
          {/* The role homes have no Settings tile, so Settings lives on the avatar. */}
          {RoleHome ? (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} accessibilityLabel="Settings" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Avatar name={firstName(me) || me?.email} size={44} tone="ink" />
            </TouchableOpacity>
          ) : null}
        </View>

        {RoleHome ? (
          <RoleHome navigation={navigation} home={home} me={me} threads={threads} tasks={tasks} reminders={reminders} updateHome={setHome} />
        ) : (
          <GeneralHome navigation={navigation} me={me} meetings={meetings} threads={threads} directory={directory} clients={clients} time={time} tasks={tasks} now={now} />
        )}
      </ScrollView>
    </Screen>
  );
}
