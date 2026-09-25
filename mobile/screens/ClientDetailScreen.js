import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAgreements, SIGN_BASE, PAY_BASE } from '../lib/api';
import { goToConversation } from '../lib/nav';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Button, Dot, Progress } from '../components/ui';

// The client money page (Aura): what is due next, what has been paid, the
// agreements and the payment schedule, with one-tap share of the sign and
// pay links. The dock is hidden here, so the bottom padding is the inset.

// Journey stages as colored text: green is live, blue is in motion, slate is
// paused, amber is still a lead.
const STAGE = {
  lead: { label: 'Lead', color: C.amber },
  onboarding: { label: 'Onboarding', color: C.blue },
  awaiting_access: { label: 'Awaiting access', color: C.blue },
  scoping: { label: 'Scoping', color: C.blue },
  plan_review: { label: 'Plan review', color: C.blue },
  in_build: { label: 'In build', color: C.blue },
  active: { label: 'Active', color: C.green },
  live: { label: 'Live', color: C.green },
  paused: { label: 'Paused', color: C.slate },
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const stageOf = (k) => STAGE[k] || { label: cap(String(k || '').replace(/_/g, ' ')) || 'Client', color: C.slate };

const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtMonth = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const isSigned = (a) => !!a && (a.status === 'signed' || !!a.signed_at);
const hairline = { borderTopWidth: 1, borderTopColor: C.line };
const rowTitle = { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink };

// Where an agreement stands, as a dot color and a one-line sub.
const agState = (a) => {
  if (isSigned(a)) return { dot: C.green, sub: a.signed_at ? `Signed ${fmtDay(a.signed_at)}` : 'Signed' };
  if (a.status === 'sent' || a.status === 'approved') return { dot: C.amberDot, sub: 'Sent, waiting for signature' };
  return { dot: C.slate, sub: 'Drafted' };
};

export default function ClientDetailScreen({ route, navigation }) {
  const { client } = route.params;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // The screen draws its own header; keep the native one off if the navigator still shows it.
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try { setData(await getAgreements(client.id)); }
    catch (e) { Alert.alert('Could not load pipeline', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const shareLink = async (label, url) => {
    try { await Share.share({ message: url }); }
    catch { Alert.alert(label, url); }
  };

  const agreements = data?.agreements || [];
  const ag = agreements[0] || null;
  const payments = data?.payments || [];

  const name = client.business_name || client.owner_name || 'Client';
  const phone = client.contact_phone || client.phone || null;
  const email = client.contact_email || client.email || null;
  const st = stageOf(client.stage);
  const since = fmtMonth(client.created_at);
  const headLead = [client.owner_name && client.owner_name !== name ? client.owner_name : null, since ? `client since ${since}` : null].filter(Boolean).join(' · ');

  // Money math, in schedule order (the API returns payments oldest first).
  const paidSum = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidCount = payments.filter(p => p.status === 'paid').length;
  const allSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(ag?.total_amount || 0) || allSum;
  const next = payments.find(p => p.status !== 'paid') || null;
  const unsigned = !!ag && !isSigned(ag);
  const payUrl = ag?.sign_token ? `${PAY_BASE}${ag.sign_token}` : null;
  const signUrl = ag?.sign_token ? `${SIGN_BASE}${ag.sign_token}` : null;
  const firstPaid = payments[0]?.status === 'paid' ? payments[0] : null;

  // Scheduled or overdue when the row carries a due date; pending otherwise.
  const dueAt = next ? (next.due_date || next.due_at || null) : null;
  const nextStatus = !next ? null
    : dueAt && new Date(dueAt) < new Date() ? { label: 'Overdue', color: C.red, dot: C.redDot }
    : dueAt ? { label: 'Scheduled', color: C.green, dot: C.green }
    : { label: 'Pending', color: C.amber, dot: C.amberDot };

  // The plan, short: the one the client picked, or read off the schedule.
  const planLabel = (() => {
    const picked = ag?.selected_plan;
    if (typeof picked === 'string' && picked) return picked;
    if (picked?.label) return picked.label;
    const amts = payments.map(p => Number(p.amount || 0));
    if (amts.length === 2 && amts[0] && amts[0] === amts[1]) return '50 / 50';
    if (amts.length) return `${amts.length} ${amts.length === 1 ? 'payment' : 'payments'}`;
    if (ag?.payment_mode) return ag.payment_mode === 'custom' ? 'Custom' : cap(ag.payment_mode);
    return 'No plan yet';
  })();
  const quoted = client.potential_value
    ? `Quoted $${Number(client.potential_value).toLocaleString()}${client.potential_value_type === 'monthly' ? '/mo' : ' one-time'}`
    : null;

  return (
    <Screen>
      <HeaderBar onBack={() => navigation.goBack()} right={<IconButton icon="ellipsis-horizontal" label="More" onPress={() => {}} />}>
        <Text numberOfLines={1} style={[T.h2, { fontSize: 24, lineHeight: 28 }]}>{name}</Text>
        <Text numberOfLines={1} style={[T.sub, { marginTop: 1 }]}>
          {headLead ? `${headLead} · ` : ''}<Text style={{ color: st.color, fontFamily: F.bold }}>{st.label}</Text>
        </Text>
      </HeaderBar>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 2, paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>

        {/* Reach them */}
        {phone || email ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {phone ? <Button label="Message" icon="chatbubble-outline" onPress={() => goToConversation(phone)} /> : null}
            {phone ? <Button label="Call" icon="call-outline" kind="soft" onPress={() => Linking.openURL(`tel:${phone}`)} /> : null}
            {email ? <Button label="Email" icon="mail-outline" kind="soft" onPress={() => Linking.openURL(`mailto:${email}`)} /> : null}
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 24 }} /> : (
          <>
            {/* Next payment */}
            <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Label>Next payment</Label>
                {payments.length === 0 ? (
                  <>
                    <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>No payment schedule yet</Text>
                    <Text style={T.sub}>Approve an agreement in the web CRM to build one.</Text>
                  </>
                ) : next ? (
                  <>
                    <Text numberOfLines={1} adjustsFontSizeToFit style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]}>{money(next.amount)}</Text>
                    <Text numberOfLines={2} style={T.sub}>{[next.label || 'Payment', next.due_condition].filter(Boolean).join(' · ')}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]}>$0</Text>
                    <Text style={T.sub}>Nothing due</Text>
                  </>
                )}
              </View>
              {next ? (
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Dot color={nextStatus.dot} />
                    <Text style={[T.meta, { color: nextStatus.color }]}>{nextStatus.label}</Text>
                  </View>
                  {payUrl ? <Button label="Send pay link" kind="white" small onPress={() => shareLink('Payment link', payUrl)} /> : null}
                </View>
              ) : payments.length ? (
                <Text style={[T.meta, { color: C.green }]}>All paid</Text>
              ) : null}
            </Tile>

            {/* Paid so far + plan */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Tile style={{ flex: 1, gap: 8 }}>
                <Label>Paid so far</Label>
                <Text style={T.h3}>
                  {money(paidSum)} <Text style={[T.sub, { fontFamily: F.semi, letterSpacing: 0 }]}>of {money(total)}</Text>
                </Text>
                <Progress value={total ? paidSum / total : 0} />
                <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>
                  {paidCount ? `${paidCount} of ${payments.length} paid${firstPaid?.paid_at ? ` · first ${fmtDay(firstPaid.paid_at)}` : ''}` : payments.length ? 'No payments yet' : 'No schedule yet'}
                </Text>
              </Tile>
              <Tile style={{ flex: 1, gap: 8 }}>
                <Label>Plan</Label>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>{planLabel}</Text>
                <Text numberOfLines={3} style={[T.sub, { fontSize: 12, lineHeight: 17 }]}>
                  {ag ? (ag.title || 'Service agreement') : (quoted || 'No agreement yet')}
                </Text>
              </Tile>
            </View>

            {/* Agreements */}
            <Tile style={{ gap: 4, paddingVertical: 14 }}>
              <Label right={(
                <TouchableOpacity onPress={() => {}} accessibilityLabel="Send a new agreement" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[T.meta, { color: C.ink }]}>Send new</Text>
                </TouchableOpacity>
              )}>Agreements</Label>
              {agreements.length === 0 ? (
                <Text style={[T.sub, { paddingVertical: 8 }]}>No agreement yet. Draft it from the web CRM pipeline, then manage it here.</Text>
              ) : agreements.map((a, i) => {
                const s = agState(a);
                return (
                  <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 }, i ? hairline : null]}>
                    <Dot color={s.dot} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text numberOfLines={1} style={rowTitle}>{a.title || 'Service agreement'}</Text>
                      <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{s.sub}</Text>
                    </View>
                    {a.sign_token ? (
                      isSigned(a)
                        ? <Button label="View" kind="white" small onPress={() => Linking.openURL(`${SIGN_BASE}${a.sign_token}`)} />
                        : <Button label="Share link" kind="white" small onPress={() => shareLink('Sign link', `${SIGN_BASE}${a.sign_token}`)} />
                    ) : null}
                  </View>
                );
              })}
            </Tile>

            {/* Payments */}
            <Tile style={{ gap: 4, paddingVertical: 14 }}>
              <Label right={payments.length ? `${money(allSum)} total` : null}>Payments</Label>
              {payments.length === 0 ? (
                <Text style={[T.sub, { paddingVertical: 8 }]}>No payment schedule yet.</Text>
              ) : payments.map((p, i) => (
                <View key={p.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 }, i ? hairline : null]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text numberOfLines={1} style={rowTitle}>{p.label || 'Payment'} · {money(p.amount)}</Text>
                    {p.due_condition ? <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{p.due_condition}</Text> : null}
                  </View>
                  <Text style={[T.meta, { color: p.status === 'paid' ? C.green : C.amber }]}>
                    {p.status === 'paid' ? `Paid ${fmtDay(p.paid_at)}`.trim() : 'Pending'}
                  </Text>
                </View>
              ))}
              {(next && payUrl) || (unsigned && signUrl) ? (
                <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
                  {next && payUrl ? <Button label="Send pay link" small onPress={() => shareLink('Payment link', payUrl)} /> : null}
                  {unsigned && signUrl ? <Button label="Share sign link" kind="white" small onPress={() => shareLink('Sign link', signUrl)} /> : null}
                </View>
              ) : null}
            </Tile>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
