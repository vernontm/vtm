import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { supabase } from '../lib/supabase';
import { getTimeEntries, clockIn, clockOut, addTimeEntry, getAdminUsers, payTimeRange } from '../lib/api';
import { C, card } from '../lib/theme';
import DateField from '../components/DateField';

const pad = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtHM = (min) => { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m % 60}m`; };
const fmtDate = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export default function TimeScreen() {
  const headerHeight = useHeaderHeight();        // keyboard offset under the nav header
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
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try { data.open ? await clockOut() : await clockIn(); await load(true); }
    catch (e) { Alert.alert('Clock error', e.message); }
    finally { setBusy(false); }
  };

  const doAdd = async () => {
    const m = parseInt(addMin, 10);
    if (!m || m <= 0) return Alert.alert('Enter minutes worked');
    setBusy(true);
    try { await addTimeEntry({ minutes: m, note: addNote.trim(), work_date: localToday() }); setAddMin(''); setAddNote(''); await load(true); }
    catch (e) { Alert.alert('Could not add', e.message); }
    finally { setBusy(false); }
  };

  const doPay = async () => {
    if (!preview?.minutes) return;
    Alert.alert(
      'Pay this period?',
      `${fmtHM(preview.minutes)} across ${preview.entry_count} entries (${fmtDate(payFrom)} to ${fmtDate(payTo)})${payAmount ? ` for ${money(payAmount)}` : ''}. Marks everything in the range paid and records the payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay', style: 'default', onPress: async () => {
          setBusy(true);
          try { await payTimeRange({ user_id: viewUserId, from: payFrom, to: payTo, amount: payAmount }); await load(true); }
          catch (e) { Alert.alert('Payment failed', e.message); }
          finally { setBusy(false); }
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
  const input = { backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.text };

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg }}><ActivityIndicator color={C.blue} style={{ marginTop: 40 }} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight} style={{ flex: 1, backgroundColor: C.bg }}>
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />}>

      {/* Admin: employee switcher */}
      {isAdmin && team.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {team.map(u => {
            const on = viewUserId === u.id;
            return (
              <TouchableOpacity key={u.id} onPress={() => setViewUserId(u.id)}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.blue : C.surface2, borderWidth: 1, borderColor: on ? C.blue : C.border }}>
                <Text style={{ color: on ? '#fff' : C.muted, fontWeight: '700', fontSize: 13 }}>
                  {u.id === me?.id ? 'Me' : teamLabel(u)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Clock — only on your own time */}
      {viewingSelf && (
        <View style={[card, { alignItems: 'center', paddingVertical: 24 }]}>
          {data.open ? (
            <>
              <Text style={{ color: C.green, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>● CLOCKED IN</Text>
              <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{elapsed()}</Text>
            </>
          ) : (
            <Text style={{ color: C.muted, fontSize: 15, marginBottom: 4 }}>Not clocked in</Text>
          )}
          <TouchableOpacity onPress={doClock} disabled={busy}
            style={{ marginTop: 14, backgroundColor: data.open ? C.red : C.green, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 44, opacity: busy ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{data.open ? 'Clock out' : 'Clock in'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Totals */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[['Today', totals.today, C.blue], ['This week', totals.week, C.text], ['Unpaid', totals.unpaid, C.green]].map(([label, v, color]) => (
          <View key={label} style={[card, { flex: 1, padding: 13 }]}>
            <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
            <Text style={{ color, fontSize: 17, fontWeight: '800', marginTop: 4 }}>{fmtHM(v)}</Text>
          </View>
        ))}
      </View>
      {isAdmin && !viewingSelf && data.hourly_rate > 0 && totals.unpaid > 0 && (
        <Text style={{ color: C.muted, fontSize: 13, marginTop: -6 }}>
          Owed at ${data.hourly_rate}/hr: <Text style={{ color: C.green, fontWeight: '800' }}>{money((totals.unpaid / 60) * data.hourly_rate)}</Text>
        </Text>
      )}

      {/* Admin: pay a period */}
      {isAdmin && (
        <View style={[card, { gap: 10 }]}>
          <Text style={{ color: C.text, fontWeight: '800' }}>Pay a period{!viewingSelf && team.length ? ` · ${teamLabel(team.find(u => u.id === viewUserId) || {})}` : ''}</Text>
          {presets.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {presets.map(pr => (
                <TouchableOpacity key={pr.label} onPress={() => { setPayFrom(pr.from); setPayTo(pr.to); }}
                  style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: payFrom === pr.from && payTo === pr.to ? C.blueSoft : C.surface2, borderWidth: 1, borderColor: payFrom === pr.from && payTo === pr.to ? C.blue : C.border }}>
                  <Text style={{ color: payFrom === pr.from && payTo === pr.to ? C.blue : C.muted, fontWeight: '700', fontSize: 12 }}>{pr.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}><DateField value={payFrom} onChange={setPayFrom} /></View>
            <Text style={{ color: C.muted }}>to</Text>
            <View style={{ flex: 1, minWidth: 0 }}><DateField value={payTo} onChange={setPayTo} /></View>
          </View>
          <Text style={{ color: preview?.minutes ? C.text : C.muted, fontSize: 13.5, fontWeight: '600' }}>
            {preview
              ? preview.minutes
                ? `${fmtHM(preview.minutes)} unpaid across ${preview.entry_count} entries${preview.hourly_rate > 0 ? ` · ${money(preview.suggested_amount)} at $${preview.hourly_rate}/hr` : ''}`
                : 'No unpaid time in this range.'
              : 'Pick a valid range…'}
          </Text>
          {preview?.minutes > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ color: C.muted }}>Paid $</Text>
              <TextInput style={[input, { width: 100 }]} keyboardType="decimal-pad" value={payAmount} onChangeText={setPayAmount} />
              <TouchableOpacity onPress={doPay} disabled={busy} style={{ flex: 1, backgroundColor: C.green, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Pay period</Text>
              </TouchableOpacity>
            </View>
          )}
          {(data.payments || []).length > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 6 }}>
              <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Payment history</Text>
              {(data.payments || []).slice(0, 6).map(p => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.muted, fontSize: 12.5 }}>{fmtDate(p.period_start)} to {fmtDate(p.period_end)} · {fmtHM(p.minutes)}</Text>
                  <Text style={{ color: C.green, fontWeight: '800', fontSize: 12.5 }}>{p.amount != null ? money(p.amount) : ''}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Manual add — own time only */}
      {viewingSelf && (
        <View style={[card, { gap: 10 }]}>
          <Text style={{ color: C.text, fontWeight: '800' }}>Add time for today</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[input, { width: 90 }]} placeholder="Min" placeholderTextColor={C.muted} keyboardType="number-pad" value={addMin} onChangeText={setAddMin} />
            <TextInput style={[input, { flex: 1, minWidth: 0 }]} placeholder="What you worked on" placeholderTextColor={C.muted} value={addNote} onChangeText={setAddNote} />
          </View>
          <TouchableOpacity onPress={doAdd} disabled={busy || !addMin} style={{ backgroundColor: C.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: busy || !addMin ? 0.6 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Add entry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Entries */}
      <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, marginTop: 4 }}>Recent entries</Text>
      {(data.entries || []).filter(e => e.minutes).slice(0, 30).map(e => (
        <View key={e.id} style={[card, { padding: 13, flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>{fmtDate(e.work_date)}{e.note ? ` · ${e.note}` : ''}</Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{fmtHM(e.minutes)}</Text>
          </View>
          <Text style={{ color: e.status === 'paid' ? C.green : C.amber, fontWeight: '800', fontSize: 12 }}>
            {e.status === 'paid' ? 'PAID' : 'UNPAID'}
          </Text>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
