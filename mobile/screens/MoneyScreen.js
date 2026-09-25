import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { getHome } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Button, Segmented, Dot, Empty, DOCK_SPACE } from '../components/ui';
import NudgeSheet from '../components/NudgeSheet';

// Money (CEO): what came in this month, what is still out, the client plans
// and the tools we pay for, with a Nudge on anything unpaid. One call (the
// `money` block of GET /home?role=ceo) feeds all three tabs. New invoices and
// the Gmail subscription scan still live in the web CRM for now.
const WEB = 'https://www.vernontm.com/admin';
const TABS = ['overview', 'invoices', 'subscriptions'];
const tabOf = (t) => (TABS.includes(t) ? t : 'overview');

const money = (v) => {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// Date-only strings ("2026-09-23") are a local calendar day, not UTC midnight.
const parseDate = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
};
const fmtDay = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const per = (cadence) => (/year|annual/i.test(cadence || '') ? '/yr' : /week/i.test(cadence || '') ? '/wk' : '/mo');
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;
const open = (url) => Linking.openURL(url).catch(e => Alert.alert('Could not open the link', e.message));
const hairline = { borderTopWidth: 1, borderTopColor: C.line };
const rowTitle = { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink };

export default function MoneyScreen({ route, navigation }) {
  const [tab, setTab] = useState(tabOf(route.params?.tab));
  const [m, setM] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [nudge, setNudge] = useState(null);   // { kind, id, label, client_name } for the sheet

  useEffect(() => { if (route.params?.tab) setTab(tabOf(route.params.tab)); }, [route.params?.tab]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const r = await getHome('ceo');
      setM(r?.money || null);
      setLoaded(true);
      setError(null);
    } catch (e) {
      const msg = e.message || 'Could not load money';
      if (quiet) Alert.alert('Could not refresh', msg); else setError(msg);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unpaid = m?.unpaid || [];
  const recent = m?.recent_payments || [];
  const plans = m?.plans || [];
  const tools = m?.tools_list || [];
  const out = m?.outstanding || {};
  const cp = m?.client_plans || {};
  const tl = m?.tools || {};

  // Plain functions for the repeated blocks, not inner components.
  const stat = (label, value, sub, color = C.ink) => (
    <Tile style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Label>{label}</Label>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[T.h3, { color }]}>{value}</Text>
      <Text numberOfLines={2} style={[T.sub, { fontSize: 12, lineHeight: 16 }]}>{sub}</Text>
    </Tile>
  );
  const row = (key, dot, title, sub, right, i) => (
    <View key={key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 }, i ? hairline : null]}>
      {dot ? <Dot color={dot} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={rowTitle}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={[T.sub, { fontSize: 12 }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  const section = (label, right, children) => (
    <View style={{ gap: 6 }}>
      <Label right={right}>{label}</Label>
      <Tile style={{ paddingVertical: 6 }}>{children}</Tile>
    </View>
  );
  const note = (text) => <Text style={[T.sub, { paddingVertical: 10 }]}>{text}</Text>;

  const unpaidRow = (u, i) => {
    const late = Number(u.days_late) > 0;
    const sub = [
      u.client_name || null,
      u.due ? `due ${fmtDay(u.due)}` : null,
      late ? `${plural(u.days_late, 'day', 'days')} late` : null,
      u.last_nudged_at ? `nudged ${fmtDay(u.last_nudged_at)}` : 'not nudged',
    ].filter(Boolean).join(' · ');
    const target = { kind: u.kind || 'invoice', id: u.id, label: u.label, client_name: u.client_name };
    return row(`u-${u.kind}-${u.id}`, late ? C.redDot : C.amberDot, `${u.label || 'Invoice'} · ${money(u.amount)}`, sub,
      <Button label="Nudge" kind="white" small onPress={() => setNudge(target)} />, i);
  };
  const paymentRow = (p, i) => row(`p-${p.id || i}`, C.green, `${p.client_name || 'Client'} · ${money(p.amount)}`,
    [p.label, fmtDay(p.paid_at)].filter(Boolean).join(' · '),
    <Text style={[T.meta, { color: C.green }]}>Paid</Text>, i);
  const planRow = (p, i) => {
    const s = p.status === 'past_due' ? { dot: C.redDot, note: `${plural(p.days_past_due || 0, 'day', 'days')} past due` }
      : p.status === 'active' ? { dot: C.green, note: p.next_renewal ? `renews ${fmtDay(p.next_renewal)}` : 'active' }
      : p.status === 'unsigned' ? { dot: C.amberDot, note: 'unsigned' }
      : { dot: C.slate, note: String(p.status || '').replace(/_/g, ' ') };
    const right = (
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[T.meta, { color: C.ink }]}>{money(p.amount)}{per(p.cadence)}</Text>
        {p.status === 'past_due' ? <Button label="Nudge" kind="white" small onPress={() => setNudge({ kind: 'plan', id: p.id, label: p.label, client_name: p.client_name })} /> : null}
      </View>
    );
    return row(`pl-${p.id || i}`, s.dot, p.client_name || p.label || 'Plan', [p.label, s.note].filter(Boolean).join(' · '), right, i);
  };
  const toolRow = (t, i) => row(`t-${t.id || i}`, null, t.service || 'Tool',
    [t.billing_cycle, t.next_renewal ? `renews ${fmtDay(t.next_renewal)}` : null, t.category].filter(Boolean).join(' · '),
    <Text style={[T.meta, { color: C.ink }]}>{money(t.amount)}{per(t.billing_cycle)}</Text>, i);

  const overview = () => (
    <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {stat('Collected', money(m.collected_month), `${m.month || 'This month'}${m.collected_prev_month != null ? ` · ${money(m.collected_prev_month)} last month` : ''}`)}
        {stat('Outstanding', money(out.total), `${plural(out.count || 0, 'unpaid', 'unpaid')} · ${out.overdue || 0} overdue`, Number(out.total) > 0 ? C.red : C.ink)}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {stat('Client plans', `${money(cp.mrr)} / mo`, `${cp.active || 0} active · ${cp.past_due || 0} past due`)}
        {stat('Tools we pay', `${money(tl.monthly)} / mo`, `${plural(tl.count || 0, 'tool', 'tools')}${tl.next?.service ? ` · next ${tl.next.service} ${fmtDay(tl.next.date)}` : ''}`)}
      </View>
      {section('Unpaid', unpaid.length ? String(unpaid.length) : null,
        unpaid.length ? unpaid.map(unpaidRow) : note('Nothing unpaid. Every invoice is settled.'))}
      {section('Recent payments', m.payments_this_week ? `${plural(m.payments_this_week, 'payment', 'payments')} this week` : null,
        recent.length ? recent.slice(0, 8).map(paymentRow) : note('No payments yet this month.'))}
    </>
  );

  const invoices = () => (!unpaid.length && !recent.length ? (
    <Empty icon="receipt-outline" title="No invoices yet" sub="Tap the plus to create one in the web CRM." />
  ) : (
    <>
      {section('Unpaid', String(unpaid.length), unpaid.length ? unpaid.map(unpaidRow) : note('Nothing unpaid.'))}
      {section('Paid', recent.length ? String(recent.length) : null, recent.length ? recent.map(paymentRow) : note('No paid invoices yet.'))}
    </>
  ));

  const subscriptions = () => (
    <>
      {section('Client plans', cp.mrr != null ? `${money(cp.mrr)} / mo` : null,
        plans.length ? plans.map(planRow) : note('No client plans yet. A plan starts when an agreement with a monthly fee is signed.'))}
      {section('Tools we pay for', tl.monthly != null ? `${money(tl.monthly)} / mo` : null,
        tools.length ? tools.map(toolRow) : note('No tools logged yet. Scan Gmail to find them.'))}
      <Button label="Scan Gmail" icon="mail-open-outline" kind="soft" onPress={() => open(`${WEB}/subscriptions`)} />
      <Text style={[T.sub, { fontSize: 12, textAlign: 'center' }]}>Opens the web CRM, which reads receipts from Gmail.</Text>
    </>
  );

  return (
    <Screen>
      <HeaderBar title="Money" sub={m ? `${m.month || 'This month'} · ${plural(m.payments_this_week || 0, 'payment', 'payments')} this week` : null}
        onBack={() => navigation.goBack()}
        right={<IconButton icon="add" dark label="New invoice" onPress={() => open(`${WEB}/invoices`)} />} />
      <View style={{ paddingHorizontal: 18, paddingBottom: 8 }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'invoices', label: 'Invoices', badge: unpaid.length, badgeColor: Number(out.overdue) > 0 ? C.redDot : C.ink },
          { value: 'subscriptions', label: 'Subscriptions' },
        ]} />
      </View>

      {loading && !loaded ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
          {error && !m ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Empty icon="cloud-offline-outline" title="Could not load money" sub={error} />
              <Button label="Try again" kind="soft" onPress={() => load()} />
            </View>
          ) : !m ? (
            <Empty icon="lock-closed-outline" title="No money view here" sub="Money figures come with the CEO home. Ask Ray to set your home layout." />
          ) : tab === 'overview' ? overview() : tab === 'invoices' ? invoices() : subscriptions()}
        </ScrollView>
      )}

      <NudgeSheet target={nudge} onClose={() => setNudge(null)} onSent={() => load(true)} />
    </Screen>
  );
}
