import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getTimeEntries, clockIn, clockOut, addTimeEntry, getAdminUsers, payTimeRange } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, Tile, Label, Chip, Button, Empty, DOCK_SPACE } from '../components/ui';
import DateField from '../components/DateField';

// Time (Aura): one big Start / Pause button on a hero tile. Each stretch is
// its own entry (one open entry at a time), so a break is just Pause, then
// Start again. Admins switch people with chips and pay a period from a tile.
const pad = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtHM = (min) => { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m % 60}m`; };
const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
const fmtClock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export default function TimeScreen({ navigation }) {
  const [me, setMe] = useState(null);            // supabase user
  const [isAdmin, setIsAdmin] = useState(false);
  const [team, setTeam] = useState([]);          // admin: all users
  const [viewUserId, setViewUserId] = useState(null);
  const [data, setData] = useState({ entries: [], hourly_rate: 0, open: null, payments: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [addMin, setAddMin] = useState('');
  const [addNote, setAddNote] = useState('');
  const [busy, setBusy] = useState(null);        // 'clock' | 'add' | 'pay' while that request runs
  // Admin pay-a-period
  const [payFrom, setPayFrom] = useState(daysAgo(6));
  const [payTo, setPayTo] = useState(localToday());
  const [preview, setPreview] = useState(null);
  const [payAmount, setPayAmount] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMe(user);
      setViewUserId(user?.id || null);
      const admin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
      setIsAdmin(admin);
      // Team members only: admins or users with CRM access grants. Client
      // portal accounts also live in auth, but they don't belong in a
      // payroll switcher.
      if (admin) getAdminUsers().then(u => setTeam((u || []).filter(x => x.is_admin || (x.grants || []).length))).catch(() => {});
    });
  }, []);

  const viewingSelf = !!me && viewUserId === me.id;

  const load = useCallback(async (quiet) => {
    if (!viewUserId) return;
    if (!quiet) setLoading(true); else setRefreshing(true);
    try { setData(await getTimeEntries(viewUserId) || { entries: [], open: null, payments: [] }); }
    catch (e) { Alert.alert('Could not load time', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [viewUserId, viewingSelf]);
  useEffect(() => { load(); }, [load]);

  // Live pay-period preview (admin).
  useEffect(() => {
    if (!isAdmin || !viewUserId || !/^\d{4}-\d{2}-\d{2}$/.test(payFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(payTo) || payFrom > payTo) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await payTimeRange({ user_id: viewUserId, from: payFrom, to: payTo, preview: true });
        setPreview(p);
        setPayAmount(p.suggested_amount ? String(p.suggested_amount) : '');
      } catch { setPreview(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [isAdmin, viewUserId, payFrom, payTo, data.entries]);

  useEffect(() => {
    if (!data.open || !viewingSelf) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [data.open, viewingSelf]);

  const liveMin = data.open ? Math.max(0, (nowTs - new Date(data.open.started_at).getTime()) / 60000) : 0;
  const totals = useMemo(() => {
    const today = localToday(), wk = weekStart();
    let t = 0, w = 0, u = 0;
    for (const e of data.entries || []) {
      if (!e.minutes) continue;
      if (e.work_date === today) t += e.minutes;
      if (e.work_date >= wk) w += e.minutes;
      if (e.status === 'logged') u += e.minutes;
    }
    return { today: t + (data.open?.work_date === today ? liveMin : 0), week: w + (data.open ? liveMin : 0), unpaid: u };
  }, [data, liveMin]);

  const doClock = async () => {
    setBusy('clock');
    try { data.open ? await clockOut() : await clockIn(); await load(true); }
    catch (e) { Alert.alert('Clock error', e.message); }
    finally { setBusy(null); }
  };

  const doAdd = async () => {
    const m = parseInt(addMin, 10);
    if (!m || m <= 0) return Alert.alert('Enter minutes worked');
    setBusy('add');
    try { await addTimeEntry({ minutes: m, note: addNote.trim(), work_date: localToday() }); setAddMin(''); setAddNote(''); await load(true); }
    catch (e) { Alert.alert('Could not add', e.message); }
    finally { setBusy(null); }
  };

  const doPay = async () => {
    if (!preview?.minutes) return;
    Alert.alert(
      'Pay this period?',
      `${fmtHM(preview.minutes)} across ${preview.entry_count} entries (${fmtDate(payFrom)} to ${fmtDate(payTo)})${payAmount ? ` for ${money(payAmount)}` : ''}. Marks everything in the range paid and records the payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay', style: 'default', onPress: async () => {
          setBusy('pay');
          try { await payTimeRange({ user_id: viewUserId, from: payFrom, to: payTo, amount: payAmount }); await load(true); }
          catch (e) { Alert.alert('Payment failed', e.message); }
          finally { setBusy(null); }
        } },
      ]
    );
  };

  const elapsed = () => {
    const s = Math.floor(liveMin * 60);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };

  // "Since last paid": from the day after the newest recorded payment period
  // through today. Auto-applied when the history loads so the obvious next
  // payroll run is one tap away.
  const presets = useMemo(() => {
    const out = [];
    const last = (data.payments || [])[0];
    if (last?.period_end) {
      const d = new Date(last.period_end + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (from <= localToday()) out.push({ label: 'Since last paid', from, to: localToday() });
    }
    out.push({ label: 'Last 7 days', from: daysAgo(6), to: localToday() });
    return out;
  }, [data.payments]);

  useEffect(() => {
    // Default the range to "since last paid" whenever this person's history loads.
    const p = presets[0];
    if (p && p.label === 'Since last paid') { setPayFrom(p.from); setPayTo(p.to); }
  }, [viewUserId, presets.length && (data.payments || [])[0]?.id]);

  const teamLabel = (u) => (u.email || '').split('@')[0];
  // Fields that sit inside a tile are white so they stay visible on the soft fill.
  const innerInput = { height: 48, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, fontFamily: F.body, fontSize: 16, color: C.ink };
  const innerDate = { backgroundColor: '#FFFFFF', borderWidth: 0, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 };
  const entries = (data.entries || []).filter(e => e.minutes).slice(0, 30);
  const headerSub = loading ? null : (data.open || totals.today > 0 ? `Today · ${fmtHM(totals.today)}` : 'Not clocked in');
  const payments = (data.payments || []);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={{ flex: 1 }}>
        <HeaderBar title="Time" sub={headerSub} onBack={() => navigation.goBack()} />
        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>

          {/* Admin: employee switcher */}
          {isAdmin && team.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
              {team.map(u => (
                <Chip key={u.id} label={u.id === me?.id ? 'Me' : teamLabel(u)} active={viewUserId === u.id} onPress={() => setViewUserId(u.id)} />
              ))}
            </ScrollView>
          )}

          {/* The clock: only on your own time */}
          {viewingSelf && (
            <Tile style={{ alignItems: 'center', paddingVertical: 26, gap: 6 }}>
              {data.open ? (
                <>
                  <Label style={{ color: C.green }}>Clocked in</Label>
                  <Text style={[T.numeral, { fontVariant: ['tabular-nums'], marginTop: 6 }]}>{elapsed()}</Text>
                  <Text style={T.sub}>since {fmtClock(data.open.started_at)}</Text>
                </>
              ) : (
                <>
                  <Label>Clock</Label>
                  <Text style={[T.h3, { marginTop: 6 }]}>Not clocked in</Text>
                  <Text style={T.sub}>{totals.today > 0 ? `${fmtHM(totals.today)} logged today` : 'Nothing logged today yet'}</Text>
                </>
              )}
              <Button label={data.open ? 'Pause' : 'Start'} kind={data.open ? 'outline' : 'primary'} icon={data.open ? 'pause-outline' : 'play-outline'}
                onPress={doClock} busy={busy === 'clock'} disabled={!!busy}
                style={{ height: 56, borderRadius: 28, alignSelf: 'stretch', marginTop: 14 }} />
              <Text style={[T.sub, { textAlign: 'center', marginTop: 6 }]}>Tap Start again after a break. Each stretch is saved on its own.</Text>
            </Tile>
          )}

          {/* Totals */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[['Today', totals.today, C.ink], ['This week', totals.week, C.ink], ['Unpaid', totals.unpaid, C.green]].map(([label, v, color]) => (
              <Tile key={label} style={{ flex: 1, padding: 14, gap: 6 }}>
                <Label>{label}</Label>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[T.h3, { color }]}>{fmtHM(v)}</Text>
              </Tile>
            ))}
          </View>
          {isAdmin && !viewingSelf && data.hourly_rate > 0 && totals.unpaid > 0 && (
            <Text style={[T.sub, { marginTop: -6, paddingHorizontal: 4 }]}>
              Owed at ${data.hourly_rate}/hr: <Text style={{ color: C.green, fontFamily: F.bold }}>{money((totals.unpaid / 60) * data.hourly_rate)}</Text>
            </Text>
          )}

          {/* Admin: pay a period */}
          {isAdmin && (
            <Tile style={{ gap: 12 }}>
              <Text style={T.title}>Pay a period{!viewingSelf && team.length ? ` · ${teamLabel(team.find(u => u.id === viewUserId) || {})}` : ''}</Text>
              {presets.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {presets.map(pr => (
                    <Chip key={pr.label} label={pr.label} active={payFrom === pr.from && payTo === pr.to} onPress={() => { setPayFrom(pr.from); setPayTo(pr.to); }} />
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1, minWidth: 0 }}><DateField value={payFrom} onChange={setPayFrom} style={innerDate} /></View>
                <Text style={T.sub}>to</Text>
                <View style={{ flex: 1, minWidth: 0 }}><DateField value={payTo} onChange={setPayTo} style={innerDate} /></View>
              </View>
              <Text style={[T.body, { color: preview?.minutes ? C.ink : C.slate }]}>
                {preview
                  ? preview.minutes
                    ? `${fmtHM(preview.minutes)} unpaid across ${preview.entry_count} entries${preview.hourly_rate > 0 ? ` · ${money(preview.suggested_amount)} at $${preview.hourly_rate}/hr` : ''}`
                    : 'No unpaid time in this range.'
                  : 'Pick a valid range.'}
              </Text>
              {preview?.minutes > 0 && (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 132, height: 48, borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14 }}>
                    <Text style={[T.body, { color: C.slate }]}>$</Text>
                    <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: 0 }} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.slate} value={payAmount} onChangeText={setPayAmount} />
                  </View>
                  <Button label="Pay period" onPress={doPay} busy={busy === 'pay'} disabled={!!busy} style={{ flex: 1, height: 48, borderRadius: 24 }} />
                </View>
              )}
              {payments.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 8 }}>
                  <Label>Payment history</Label>
                  {payments.slice(0, 6).map(p => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={[T.sub, { flex: 1 }]}>{fmtDate(p.period_start)} to {fmtDate(p.period_end)} · {fmtHM(p.minutes)}</Text>
                      <Text style={[T.meta, { color: C.green }]}>{p.amount != null ? money(p.amount) : ''}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Tile>
          )}

          {/* Manual add: own time only */}
          {viewingSelf && (
            <Tile style={{ gap: 12 }}>
              <Text style={T.title}>Add time for today</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[innerInput, { width: 92 }]} placeholder="Min" placeholderTextColor={C.slate} keyboardType="number-pad" value={addMin} onChangeText={setAddMin} />
                <TextInput style={[innerInput, { flex: 1, minWidth: 0 }]} placeholder="What you worked on" placeholderTextColor={C.slate} value={addNote} onChangeText={setAddNote} />
              </View>
              <Button label="Add entry" kind="white" icon="add" onPress={doAdd} busy={busy === 'add'} disabled={!!busy || !addMin} />
            </Tile>
          )}

          {/* Entries */}
          <Label style={{ paddingHorizontal: 4, marginTop: 4 }}>Recent entries</Label>
          {entries.length === 0 && <Empty icon="time-outline" title="No entries yet" sub="Start the clock or add time by hand." />}
          {entries.map(e => (
            <Tile white key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={T.body}>{fmtDate(e.work_date)}{e.note ? ` · ${e.note}` : ''}</Text>
                <Text style={T.sub}>{fmtHM(e.minutes)}</Text>
              </View>
              <Text style={[T.meta, { color: e.status === 'paid' ? C.green : C.amber }]}>
                {e.status === 'paid' ? 'PAID' : 'UNPAID'}
              </Text>
            </Tile>
          ))}
        </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
