import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAgreements, getClientActivity, SIGN_BASE, PAY_BASE } from '../lib/api';
import { goToConversation } from '../lib/nav';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Button, Segmented, GradientChip, Dot, Progress, Empty } from '../components/ui';
import NudgeSheet from '../components/NudgeSheet';

// The client page (Aura), four tabs. Overview: what is next, the balance, the
// plan, the latest files and activity. Money: what is due next, what has been
// paid, the agreements and the payment schedule, with one-tap share of the
// sign and pay links. Files and Activity: the full lists. The dock is hidden
// here, so the bottom padding is the inset. Data: the agreements pipeline
// plus the client activity bundle (GET /client-activity?client_id=).

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
  client: { label: 'Client', color: C.green },
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const stageOf = (k) => STAGE[k] || { label: cap(String(k || '').replace(/_/g, ' ')) || 'Client', color: C.slate };

const TABS = ['overview', 'money', 'files', 'activity'];
const tabOf = (t) => (TABS.includes(t) ? t : 'overview');

// Date-only strings ("2026-10-15") are a local calendar day, not UTC midnight.
const parseDate = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
};
const fmtDay = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const fmtMonth = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''; };
const fmtDateTime = (s) => { const d = parseDate(s); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
const dayKey = (s) => { const d = parseDate(s); return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'undated'; };
const dayLabel = (s) => {
  const d = parseDate(s);
  if (!d) return 'Undated';
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const isSigned = (a) => !!a && (a.status === 'signed' || !!a.signed_at);
const open = (url) => Linking.openURL(url).catch(e => Alert.alert('Could not open the link', e.message));
const hairline = { borderTopWidth: 1, borderTopColor: C.line };
const rowTitle = { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink };

// Where an agreement stands, as a dot color and a one-line sub.
const agState = (a) => {
  if (isSigned(a)) return { dot: C.green, sub: a.signed_at ? `Signed ${fmtDay(a.signed_at)}` : 'Signed' };
  if (a.status === 'sent' || a.status === 'approved') return { dot: C.amberDot, sub: 'Sent, waiting for signature' };
  return { dot: C.slate, sub: 'Drafted' };
};

// Activity rows carry a kind; each gets its own dot color. An agreement is
// amber while unsigned.
const kindDot = (a) => {
  switch (a.kind) {
    case 'text': return C.ink;
    case 'agreement': return a.severity === 'red' ? C.redDot : a.severity === 'amber' ? C.amberDot : C.green;
    case 'meeting': return C.violet;
    case 'payment': return C.green;
    default: return C.slate;   // nudge, note
  }
};
const isUnsignedRow = (a) => a.kind === 'agreement' && (a.severity === 'amber' || a.severity === 'red' || /unsigned|waiting|not signed/i.test(`${a.title || ''} ${a.sub || ''}`));
const fileIcon = (k) => {
  const s = String(k || '').toLowerCase();
  if (/image|png|jpe?g|gif|heic|webp/.test(s)) return 'image-outline';
  if (/video|mp4|mov/.test(s)) return 'videocam-outline';
  if (/audio|m4a|mp3|wav/.test(s)) return 'mic-outline';
  if (/pdf/.test(s)) return 'document-outline';
  if (/sheet|xlsx?|csv/.test(s)) return 'grid-outline';
  return 'document-text-outline';
};
const PLAN_TONE = {
  unsigned: { label: 'Unsigned', color: C.amber, dot: C.amberDot },
  draft: { label: 'Draft', color: C.slate, dot: C.slate },
  active: { label: 'Active', color: C.green, dot: C.green },
  signed: { label: 'Signed', color: C.green, dot: C.green },
  past_due: { label: 'Past due', color: C.red, dot: C.redDot },
  paused: { label: 'Paused', color: C.slate, dot: C.slate },
  cancelled: { label: 'Cancelled', color: C.slate, dot: C.slate },
};
const planTone = (s) => PLAN_TONE[s] || { label: cap(String(s || '').replace(/_/g, ' ')) || 'Plan', color: C.slate, dot: C.slate };

// The activity endpoint used to return bare crm_client_activity rows; fold
// that shape into the bundle so an older deploy still renders.
const normalizeActivity = (r) => {
  if (Array.isArray(r)) {
    return { activity: r.map(x => ({ kind: x.type || 'note', at: x.created_at, title: x.title || x.tag || cap(String(x.type || 'note')), sub: x.body ? String(x.body).slice(0, 160) : null })) };
  }
  return r && typeof r === 'object' ? r : {};
};

export default function ClientDetailScreen({ route, navigation }) {
  const client = route.params?.client || {};
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(tabOf(route.params?.tab));
  const [data, setData] = useState(null);   // agreements + payments
  const [act, setAct] = useState(null);     // the activity bundle: client, files, activity, next_up, balance, plan
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nudge, setNudge] = useState(null);

  // The screen draws its own header; keep the native one off if the navigator still shows it.
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  useEffect(() => { if (route.params?.tab) setTab(tabOf(route.params.tab)); }, [route.params?.tab]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    const [ag, ac] = await Promise.allSettled([getAgreements(client.id), getClientActivity(client.id)]);
    if (ag.status === 'fulfilled') setData(ag.value || {});
    if (ac.status === 'fulfilled') setAct(normalizeActivity(ac.value));
    const errs = [ag, ac].filter(r => r.status === 'rejected').map(r => r.reason?.message || 'Request failed');
    if (errs.length) Alert.alert('Could not load everything', Array.from(new Set(errs)).join('\n'));
    setLoading(false); setRefreshing(false);
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const shareLink = async (label, url) => {
    try { await Share.share({ message: url }); }
    catch { Alert.alert(label, url); }
  };

  const agreements = data?.agreements || [];
  const ag = agreements[0] || null;
  const payments = data?.payments || [];
  const files = act?.files || [];
  const activity = act?.activity || [];
  const info = act?.client || {};

  // The record may arrive slim (from a home tile: id, name, phone, email);
  // the activity bundle fills in the rest.
  const name = client.business_name || client.name || client.client_name || info.name || client.owner_name || 'Client';
  const owner = client.owner_name || info.owner_name || null;
  const phone = client.contact_phone || client.phone || info.phone || null;
  const email = client.contact_email || client.email || info.email || null;
  const st = stageOf(client.stage || info.stage);
  const since = fmtMonth(client.created_at || info.since);
  const headLead = [owner && owner !== name ? owner : null, since ? `client since ${since}` : null].filter(Boolean).join(' · ');

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

  // Overview figures: from the bundle, else read off the schedule.
  const bal = act?.balance || { due: next ? Number(next.amount || 0) : 0, due_on: dueAt, paid: paidSum, total };
  const plan = act?.plan || (ag ? {
    label: ag.title || 'Service agreement',
    monthly: Number(ag.terms?.monthly?.[0]?.amount) || null,
    starts: null,
    status: isSigned(ag) ? 'active' : (ag.status === 'sent' || ag.status === 'approved') ? 'unsigned' : 'draft',
  } : null);
  const nextUp = act?.next_up || null;
  const unsignedAg = agreements.find(a => !isSigned(a) && (a.status === 'sent' || a.status === 'approved')) || null;

  const groups = useMemo(() => {
    const out = []; const idx = {};
    for (const a of activity) {
      const k = dayKey(a.at);
      if (idx[k] == null) { idx[k] = out.length; out.push({ key: k, label: dayLabel(a.at), items: [] }); }
      out[idx[k]].items.push(a);
    }
    return out;
  }, [activity]);

  const draftAgreement = () => navigation.navigate('AgreementDraft', {
    client: { ...client, id: client.id, business_name: client.business_name || name, owner_name: owner || client.owner_name, contact_phone: phone, contact_email: email },
  });
  const nudgeAgreement = (a) => {
    const id = a.agreement_id || a.target_id || unsignedAg?.id || a.id;
    if (!id) return Alert.alert('Nothing to nudge', 'No unsigned agreement is on file for this client.');
    setNudge({ kind: 'agreement', id, label: a.title || unsignedAg?.title || 'Agreement', client_name: name });
  };

  // Plain functions for the repeated blocks, not inner components.
  const seeAll = (t) => (
    <TouchableOpacity onPress={() => setTab(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`See all ${t}`}>
      <Text style={[T.meta, { color: C.ink }]}>See all</Text>
    </TouchableOpacity>
  );
  const fileRow = (f, i) => (
    <View key={f.id || `${f.name}-${i}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 }, i ? hairline : null]}>
      <Ionicons name={fileIcon(f.kind || f.name)} size={18} color={C.ink} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={rowTitle}>{f.name || 'File'}</Text>
        <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{[f.by_name, fmtDay(f.at)].filter(Boolean).join(' · ') || 'File'}</Text>
      </View>
      {f.url ? <Button label="Open" kind="white" small onPress={() => open(f.url)} /> : null}
    </View>
  );
  const activityRow = (a, i) => (
    <View key={a.id || `${a.kind}-${a.at}-${i}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 }, i ? hairline : null]}>
      <Dot color={kindDot(a)} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={2} style={rowTitle}>{a.title || cap(a.kind || 'activity')}</Text>
        <Text numberOfLines={2} style={[T.sub, { fontSize: 12 }]}>{[a.sub, fmtDateTime(a.at)].filter(Boolean).join(' · ')}</Text>
      </View>
      {isUnsignedRow(a) ? <Button label="Nudge" kind="white" small onPress={() => nudgeAgreement(a)} />
        : a.link ? <IconButton icon="open-outline" size={34} white label="Open" onPress={() => open(a.link)} /> : null}
    </View>
  );

  const overviewTab = () => (
    <>
      {/* Next */}
      <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Label>Next</Label>
          {nextUp ? (
            <>
              <Text numberOfLines={2} style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>{nextUp.title || 'Meeting'}</Text>
              <Text numberOfLines={2} style={T.sub}>{[fmtDateTime(nextUp.start_time), nextUp.location || (nextUp.meet_link ? 'Google Meet' : null)].filter(Boolean).join(' · ')}</Text>
            </>
          ) : (
            <>
              <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>Nothing scheduled</Text>
              <Text style={T.sub}>Book the next meeting from the calendar.</Text>
            </>
          )}
        </View>
        {nextUp?.meet_link ? <Button label="Join" icon="videocam-outline" kind="white" small onPress={() => open(nextUp.meet_link)} />
          : nextUp?.location ? <Button label="Directions" icon="navigate-outline" kind="white" small onPress={() => open(nextUp.maps_url || `https://maps.apple.com/?q=${encodeURIComponent(nextUp.location)}`)} />
          : null}
      </Tile>

      {/* Balance + plan */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Label>Balance</Label>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[T.h3, { color: Number(bal.due) > 0 ? C.ink : C.green }]}>{money(bal.due)}</Text>
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{Number(bal.due) > 0 ? (bal.due_on ? `due ${fmtDay(bal.due_on)}` : 'due') : 'nothing due'}</Text>
          <Progress value={Number(bal.total) ? Number(bal.paid || 0) / Number(bal.total) : 0} />
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{money(bal.paid)} of {money(bal.total)} paid</Text>
        </Tile>
        <Tile style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Label>Plan</Label>
          {plan ? (
            <>
              <Text numberOfLines={2} style={[T.h3, { fontSize: 18, lineHeight: 22 }]}>{plan.label || 'Plan'}</Text>
              <Text numberOfLines={2} style={[T.sub, { fontSize: 12 }]}>
                {[plan.monthly ? `${money(plan.monthly)}/mo` : null, plan.starts ? `starts ${fmtDay(plan.starts)}` : null].filter(Boolean).join(' · ') || 'One-time'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot color={planTone(plan.status).dot} />
                <Text style={[T.meta, { color: planTone(plan.status).color }]}>{planTone(plan.status).label}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[T.h3, { fontSize: 18, lineHeight: 22 }]}>No plan yet</Text>
              <Text numberOfLines={3} style={[T.sub, { fontSize: 12 }]}>{quoted || 'Draft an agreement to set one.'}</Text>
            </>
          )}
        </Tile>
      </View>

      {/* Files */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={files.length > 3 ? seeAll('files') : null}>Files</Label>
        {files.length === 0 ? <Text style={[T.sub, { paddingVertical: 8 }]}>No files yet.</Text> : files.slice(0, 3).map(fileRow)}
      </Tile>

      {/* Activity */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={activity.length > 4 ? seeAll('activity') : null}>Activity</Label>
        {activity.length === 0 ? <Text style={[T.sub, { paddingVertical: 8 }]}>Nothing yet.</Text> : activity.slice(0, 4).map(activityRow)}
      </Tile>
    </>
  );

  const moneyTab = () => (
    <>
      {/* Next payment */}
      <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Label>Next payment</Label>
          {payments.length === 0 ? (
            <>
              <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>No payment schedule yet</Text>
              <Text style={T.sub}>Draft and send an agreement to build one.</Text>
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
          <TouchableOpacity onPress={draftAgreement} accessibilityLabel="Draft a new agreement" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[T.meta, { color: C.ink }]}>Send new</Text>
          </TouchableOpacity>
        )}>Agreements</Label>
        {agreements.length === 0 ? (
          <Text style={[T.sub, { paddingVertical: 8 }]}>No agreement yet. Tap Draft agreement to write one from the texts and call notes.</Text>
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
                  ? <Button label="View" kind="white" small onPress={() => open(`${SIGN_BASE}${a.sign_token}`)} />
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
  );

  const filesTab = () => (files.length === 0 ? (
    <Empty icon="folder-open-outline" title="No files yet" sub="Files the client shares and the ones we upload show up here." />
  ) : (
    <Tile style={{ gap: 4, paddingVertical: 14 }}>
      <Label right={`${files.length} ${files.length === 1 ? 'file' : 'files'}`}>Files</Label>
      {files.map(fileRow)}
    </Tile>
  ));

  const activityTab = () => (activity.length === 0 ? (
    <Empty icon="pulse-outline" title="No activity yet" sub="Texts, meetings, payments, agreements and nudges land here." />
  ) : groups.map(g => (
    <View key={g.key} style={{ gap: 6 }}>
      <Label>{g.label}</Label>
      <Tile style={{ gap: 4, paddingVertical: 8 }}>{g.items.map(activityRow)}</Tile>
    </View>
  )));

  return (
    <Screen>
      <HeaderBar onBack={() => navigation.goBack()} right={<IconButton icon="ellipsis-horizontal" label="More" onPress={() => {}} />}>
        <Text numberOfLines={1} style={[T.h2, { fontSize: 24, lineHeight: 28 }]}>{name}</Text>
        <Text numberOfLines={1} style={[T.sub, { marginTop: 1 }]}>
          {headLead ? `${headLead} · ` : ''}<Text style={{ color: st.color, fontFamily: F.bold }}>{st.label}</Text>
        </Text>
      </HeaderBar>

      {/* Reach them, or start an agreement */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <Button label="Message" icon="chatbubble-outline" small disabled={!phone} onPress={() => goToConversation(phone)} />
        <Button label="Call" icon="call-outline" kind="soft" small disabled={!phone} onPress={() => open(`tel:${phone}`)} />
        <Button label="Email" icon="mail-outline" kind="soft" small disabled={!email} onPress={() => open(`mailto:${email}`)} />
        <GradientChip label="Draft agreement" onPress={draftAgreement} />
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'money', label: 'Money' },
          { value: 'files', label: 'Files' },
          { value: 'activity', label: 'Activity' },
        ]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 24 }} />
          : tab === 'overview' ? overviewTab()
          : tab === 'money' ? moneyTab()
          : tab === 'files' ? filesTab()
          : activityTab()}
      </ScrollView>

      <NudgeSheet target={nudge} onClose={() => setNudge(null)} onSent={() => load(true)} />
    </Screen>
  );
}
