import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sheet from '../components/Sheet';
import { supabase } from '../lib/supabase';
import { trackAction } from '../lib/track';
import { agreementAnalyze, agreementGenerate, sendAgreement, textSignLink } from '../lib/api';
import { openAssistant } from '../lib/nav';
import { C, T, F, GRAD } from '../lib/theme';
import { Screen, HeaderBar, Tile, Label, Button, Chip, GradientChip, Dot } from '../components/ui';

// A new agreement, from the phone. The assistant reads the client's texts
// and call notes (agreement-ai analyze), drafts the service agreement and
// the NDA (generate), takes edits section by section or as an instruction
// (generate with base), and Finalize and send saves the row with its payment
// schedule, links the deal, emails the sign link and texts it. Every step
// shows its state; nothing fails quietly.

// Three calls lib/api.js does not cover, in its request shape. Its
// `agreementApprove` posts to /agreements?action=approve, which needs an
// existing agreement id in the query; creating the row from a draft is
// agreement-ai's approve (the same call the web CRM makes).
const BASE = 'https://www.vernontm.com/api/crm';
async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}
// Creates the crm_agreements row (status approved) and its crm_payments rows from the draft. Reply { ok, agreement_id }.
const approveDraft = (client_id, draft) => request('/agreement-ai?action=approve', { method: 'POST', body: JSON.stringify({ client_id, draft }) });
// Links the deal on the pipeline (idempotent). Reply { ok, status, deal_id }.
const linkDeal = (id) => request(`/agreements?action=approve&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });
// Mints the sign link without emailing, for a client with no email on file. Reply { ok, sign_token, link }.
const markSent = (id) => request(`/agreements?action=mark-sent&id=${encodeURIComponent(id)}`, { method: 'POST', body: '{}' });

const money = (v) => {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// House rule: no em or en dashes in anything shown or sent.
const clean = (s) => String(s || '').replace(/\s*\u2014\s*/g, ', ').replace(/\s*\u2013\s*/g, '-').trim();
const open = (url) => Linking.openURL(url).catch(e => Alert.alert('Could not open the link', e.message));
const hairline = { borderTopWidth: 1, borderTopColor: C.line };
const rowTitle = { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink };

// Anything list-like the analysis may carry (a string, an array of strings,
// or of { label | item | text, amount, trigger }) as plain lines.
const listify = (v) => {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\n+/).map(s => s.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  if (!Array.isArray(v)) return [];
  return v.map(x => {
    if (typeof x === 'string') return x.trim();
    if (x && typeof x === 'object') {
      const t = x.label || x.item || x.text || x.title || '';
      return `${t}${x.amount != null ? ` ${money(x.amount)}` : ''}${x.trigger ? `, ${x.trigger}` : ''}`.trim();
    }
    return '';
  }).filter(Boolean);
};
// The analyze reply as three bullet lists: the terms it found, the gaps it
// flagged, the questions it would ask.
const analysisBullets = (a) => {
  if (!a) return { terms: [], flags: [], questions: [] };
  const terms = [];
  if (a.suggested_total) terms.push(`Total ${money(a.suggested_total)}${a.suggested_structure ? `: ${clean(a.suggested_structure)}` : ''}`);
  for (const i of Array.isArray(a.suggested_installments) ? a.suggested_installments : []) terms.push(`${i.label || 'Payment'}: ${money(i.amount)}${i.trigger ? `, ${clean(i.trigger)}` : ''}`);
  for (const m of Array.isArray(a.suggested_monthly) ? a.suggested_monthly : []) terms.push(`${m.item || 'Monthly'}: ${money(m.amount)} per month`);
  for (const s of [...listify(a.summary), ...listify(a.terms), ...listify(a.points), ...listify(a.highlights)]) { const c = clean(s); if (c && !terms.includes(c)) terms.push(c); }
  return { terms, flags: listify(a.flags).map(clean).slice(0, 6), questions: listify(a.questions).map(clean).slice(0, 6) };
};
// The billing terms handed to generate: what the analysis proposed, plus
// anything Ray added (which wins).
const termsText = (a, extra) => {
  const lines = [];
  if (a?.suggested_total) lines.push(`Total: ${money(a.suggested_total)}.`);
  if (a?.suggested_structure) lines.push(`Payment structure: ${clean(a.suggested_structure)}.`);
  if (Array.isArray(a?.suggested_installments) && a.suggested_installments.length) lines.push(`Installments: ${a.suggested_installments.map(i => `${i.label || 'Payment'} ${money(i.amount)}${i.trigger ? ` (${clean(i.trigger)})` : ''}`).join('; ')}.`);
  if (Array.isArray(a?.suggested_monthly) && a.suggested_monthly.length) lines.push(`Monthly: ${a.suggested_monthly.map(m => `${m.item || 'item'} ${money(m.amount)}/mo`).join('; ')}.`);
  if (typeof a?.terms === 'string' && a.terms.trim()) lines.push(clean(a.terms));
  const x = String(extra || '').trim();
  if (x) lines.push(`Notes from Ray (these override anything above): ${x}`);
  return lines.join('\n');
};
const normalizeDraft = (r, prev) => {
  const d = r && typeof r === 'object' ? r : {};
  const out = {
    summary: clean(d.summary || prev?.summary || ''),
    recap: d.recap || prev?.recap || '',
    features: Array.isArray(d.features) ? d.features : (prev?.features || []),
    total: Number(d.total) || Number(prev?.total) || 0,
    installments: Array.isArray(d.installments) ? d.installments : (prev?.installments || []),
    monthly: Array.isArray(d.monthly) ? d.monthly : (prev?.monthly || []),
    agreement_markdown: String(d.agreement_markdown || prev?.agreement_markdown || ''),
    nda_markdown: String(d.nda_markdown || prev?.nda_markdown || ''),
  };
  if (!out.agreement_markdown.trim()) throw new Error('The draft came back empty. Try again.');
  return out;
};

// The agreement markdown as editable sections: a markdown heading, a bold
// line on its own, or (only when the document has no headings at all) a
// numbered title line. The heading line is kept verbatim so the document
// joins back together unchanged.
const MD_HEAD = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const BOLD_HEAD = /^\s*\*\*\s*([^*]{2,90}?)\s*\*\*\s*:?\s*$/;
const NUM_HEAD = /^\s*(\d{1,2}\.\s+[A-Z][^.:$\n]{2,48})\s*$/;
function splitSections(md, allowNumbered) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = { title: 'Parties', head: null, lines: [] };
  for (const line of lines) {
    const m = line.match(MD_HEAD) || line.match(BOLD_HEAD) || (allowNumbered ? line.match(NUM_HEAD) : null);
    if (m) {
      if (cur.head !== null || cur.lines.some(l => l.trim())) out.push(cur);
      cur = { title: m[1].replace(/[*_`]/g, '').trim(), head: line, lines: [] };
    } else cur.lines.push(line);
  }
  out.push(cur);
  return out.map(s => ({ title: s.title, head: s.head, body: s.lines.join('\n').replace(/^\n+|\n+$/g, '') }));
}
const sectionsOf = (md) => { const a = splitSections(md, false); return a.length >= 3 ? a : splitSections(md, true); };
const joinSections = (secs) => secs.map(s => (s.head != null ? `${s.head}\n${s.body}` : s.body)).join('\n\n');
const firstLine = (body) => {
  const l = String(body || '').split('\n').map(s => s.replace(/[#*_>`]/g, '').replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim()).find(Boolean) || '';
  return l.length > 96 ? `${l.slice(0, 93).trim()}...` : l;
};

const QUICK = [
  ['Add a rush fee', 'Add a rush fee clause: work the client asks to have done on a rush timeline is billed at an additional 25 percent, agreed in writing before the work starts.'],
  ['Net 15', 'Change the payment terms so every invoice is due Net 15 (within 15 days of the invoice date).'],
  ['Shorter', 'Make the whole agreement shorter and plainer without dropping any term, amount or date.'],
];

export default function AgreementDraftScreen({ route, navigation }) {
  const client = route.params?.client || {};
  const insets = useSafeAreaInsets();
  const name = client.business_name || client.name || client.client_name || client.owner_name || 'Client';

  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(true);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [extra, setExtra] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [applying, setApplying] = useState(false);
  const [editing, setEditing] = useState(null);   // { doc: 'agreement' | 'nda', index, title }
  const [editText, setEditText] = useState('');
  const [sending, setSending] = useState(null);   // the step under way, as a line of text
  const [done, setDone] = useState(null);         // { id, link, emailed, texted, textError, dealWarning }
  const [retexting, setRetexting] = useState(false);

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  const analyze = useCallback(async () => {
    if (!client.id) { setAnalyzing(false); setAnalyzeError('This record has no client id, so there is nothing to read.'); return; }
    setAnalyzing(true); setAnalyzeError(null);
    try { setAnalysis(await agreementAnalyze(client.id)); }
    catch (e) { setAnalyzeError(e.message || 'Could not read the client history'); }
    finally { setAnalyzing(false); }
  }, [client.id]);
  useEffect(() => { analyze(); }, [analyze]);

  const ab = useMemo(() => analysisBullets(analysis), [analysis]);
  const sections = useMemo(() => (draft ? sectionsOf(draft.agreement_markdown) : []), [draft?.agreement_markdown]);

  const generate = async () => {
    if (!client.id) return Alert.alert('No client id', 'Open this client from People and try again.');
    setGenerating(true); setGenError(null);
    try {
      const r = await agreementGenerate({ client_id: client.id, terms: termsText(analysis, extra) });
      setDraft(normalizeDraft(r));
    } catch (e) { setGenError(e.message || 'Could not draft the agreement'); }
    finally { setGenerating(false); }
  };
  const confirmRegenerate = () => Alert.alert('Redo the draft?', 'Your edits to this draft will be replaced.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Redo', style: 'destructive', onPress: () => { setDraft(null); setGenError(null); } },
  ]);
  // A change on top of the current draft: the server keeps everything else
  // as it is. `terms` carries the same text for the current revise path.
  const apply = async (instr) => {
    const text = String(instr || '').trim();
    if (!text || !draft) return;
    setApplying(true);
    try {
      const r = await agreementGenerate({ client_id: client.id, terms: text, instruction: text, base: draft });
      setDraft(normalizeDraft(r, draft));
      setInstruction('');
    } catch (e) { Alert.alert('Could not apply that change', e.message); }
    finally { setApplying(false); }
  };

  const openEdit = (target, text) => { setEditing(target); setEditText(String(text || '')); };
  const saveEdit = () => {
    if (!editing) return;
    if (editing.doc === 'nda') setDraft(d => ({ ...d, nda_markdown: editText }));
    else {
      const next = sections.map((s, i) => (i === editing.index ? { ...s, body: editText } : s));
      setDraft(d => ({ ...d, agreement_markdown: joinSections(next) }));
    }
    setEditing(null);
  };

  const confirmFinalize = () => Alert.alert(`Send to ${name}?`, 'This saves the agreement with its payment schedule, emails the sign link and texts it to the client.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Finalize and send', onPress: runFinalize },
  ]);
  const runFinalize = async () => {
    if (!draft) return;
    let id = null;
    setSending('Saving the agreement and the payment schedule');
    try {
      const r = await approveDraft(client.id, draft);
      id = r?.agreement_id || null;
      if (!id) throw new Error('The server did not return an agreement id.');
      trackAction('agreement_finalized');
    } catch (e) { setSending(null); return Alert.alert('Could not save the agreement', e.message); }

    let dealWarning = null;
    setSending('Putting it on the pipeline');
    try { await linkDeal(id); } catch (e) { dealWarning = e.message; }

    // Email first: send mints the sign link. With no email on file the
    // server refuses, so mint the link without emailing and text it instead.
    let link = null, emailed = false;
    setSending('Emailing the sign link');
    try { const r = await sendAgreement(id); link = r?.link || null; emailed = true; }
    catch (e) {
      if (!/no email/i.test(e.message || '')) { setSending(null); return Alert.alert('Could not send the agreement', `${e.message}\n\nThe agreement is saved; you can send it from the web CRM.`); }
      try { const r = await markSent(id); link = r?.link || null; }
      catch (e2) { setSending(null); return Alert.alert('Could not create the sign link', e2.message); }
    }

    let texted = false, textError = null;
    setSending('Texting the sign link');
    try { const r = await textSignLink(id); texted = r?.ok !== false; }
    catch (e) { if (!/no (phone|number|mobile)/i.test(e.message || '')) textError = e.message; }

    setSending(null);
    setDone({ id, link, emailed, texted, textError, dealWarning });
  };
  const retryText = async () => {
    if (!done?.id) return;
    setRetexting(true);
    try { await textSignLink(done.id); setDone(d => ({ ...d, texted: true, textError: null })); }
    catch (e) { Alert.alert('Could not text the link', e.message); }
    finally { setRetexting(false); }
  };
  const deliveryLine = (d) => {
    if (d.emailed && d.texted) return `Sent by text and email to ${name}.`;
    if (d.emailed) return d.textError ? `Emailed to ${name}. The text did not go out, see below.` : `Sent by email only: ${name} has no phone number on file.`;
    if (d.texted) return `Sent by text only: ${name} has no email on file.`;
    return `The agreement is finalized, but ${name} has no phone or email on file. Share the sign link yourself.`;
  };

  const field = { minHeight: 96, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink, textAlignVertical: 'top' };

  // Plain functions for the repeated blocks, not inner components (an inner
  // component would remount on each keystroke and drop the keyboard focus).
  const glass = (children) => (
    <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 1.5, borderRadius: 24 }}>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 22.5, padding: 16, gap: 10 }}>{children}</View>
    </LinearGradient>
  );
  const bullet = (text, key, color = C.violet) => (
    <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Dot color={color} size={6} style={{ marginTop: 7 }} />
      <Text style={[T.body, { flex: 1, fontSize: 14, lineHeight: 20 }]}>{text}</Text>
    </View>
  );
  const sectionRow = (key, title, sub, onEdit, i) => (
    <View key={key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 6 }, i ? hairline : null]}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={rowTitle}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{sub}</Text> : null}
      </View>
      <Button label="Edit" icon="pencil-outline" kind="white" small onPress={onEdit} disabled={applying || !!sending} />
    </View>
  );

  const analysisBlock = () => {
    if (analyzing) return glass(
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ActivityIndicator color={C.violet} size="small" />
        <Text style={T.sub}>Reading the texts and the last call</Text>
      </View>
    );
    if (analyzeError) return (
      <Tile style={{ gap: 10, backgroundColor: C.redSoft }}>
        <Text style={[T.body, { color: C.red }]}>{analyzeError}</Text>
        <Button label="Try again" kind="white" small onPress={analyze} style={{ alignSelf: 'flex-start' }} />
      </Tile>
    );
    return glass(
      <>
        <Label style={{ color: C.violet }}>From your texts and the last call</Label>
        {ab.terms.length ? ab.terms.map((t, i) => bullet(t, `t${i}`)) : <Text style={T.sub}>Nothing specific came back. Add the terms below and generate.</Text>}
        {ab.flags.length ? (
          <View style={{ gap: 6, paddingTop: 4 }}>
            <Label>Might be missing</Label>
            {ab.flags.map((t, i) => bullet(t, `f${i}`, C.amberDot))}
          </View>
        ) : null}
        {ab.questions.length ? (
          <View style={{ gap: 6, paddingTop: 4 }}>
            <Label>Worth confirming</Label>
            {ab.questions.map((t, i) => bullet(t, `q${i}`, C.slate))}
          </View>
        ) : null}
      </>
    );
  };

  const beforeDraft = () => (
    <>
      <View style={{ gap: 6 }}>
        <Label>Anything to add or change</Label>
        <TextInput style={field} multiline value={extra} onChangeText={setExtra} editable={!generating}
          placeholder="Optional. For example: $550 a month, six month minimum, launch by November 15" placeholderTextColor={C.slate} />
      </View>
      <Button label="Generate draft" icon="sparkles" onPress={generate} busy={generating} disabled={analyzing} />
      {generating ? <Text style={[T.sub, { textAlign: 'center' }]}>Drafting the agreement and the NDA. This takes about a minute.</Text> : null}
      {genError ? (
        <Tile style={{ gap: 10, backgroundColor: C.redSoft }}>
          <Text style={[T.body, { color: C.red }]}>{genError}</Text>
          <Button label="Try again" kind="white" small onPress={generate} style={{ alignSelf: 'flex-start' }} />
        </Tile>
      ) : null}
    </>
  );

  const draftView = () => (
    <>
      <Tile style={{ gap: 6 }}>
        <Label right={(
          <TouchableOpacity onPress={confirmRegenerate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Redo the draft">
            <Text style={[T.meta, { color: C.ink }]}>Redo</Text>
          </TouchableOpacity>
        )}>Terms</Label>
        <Text style={T.h3}>{money(draft.total)}</Text>
        {draft.summary ? <Text style={T.sub}>{draft.summary}</Text> : null}
        {draft.installments.map((i, k) => (
          <Text key={`i${k}`} style={[T.body, { fontSize: 14 }]}>{i.label || 'Payment'} · {money(i.amount)}{i.trigger ? ` · ${clean(i.trigger)}` : ''}</Text>
        ))}
        {draft.monthly.map((m, k) => (
          <Text key={`m${k}`} style={[T.body, { fontSize: 14 }]}>{m.item || 'Monthly'} · {money(m.amount)}/mo</Text>
        ))}
      </Tile>

      <View style={{ gap: 6, opacity: applying ? 0.6 : 1 }}>
        <Label right={`${sections.length} ${sections.length === 1 ? 'section' : 'sections'}`}>Service agreement</Label>
        <Tile style={{ gap: 4, paddingVertical: 8 }}>
          {sections.map((s, i) => sectionRow(`s${i}`, s.title, firstLine(s.body), () => openEdit({ doc: 'agreement', index: i, title: s.title }, s.body), i))}
        </Tile>
        <Label style={{ marginTop: 6 }}>Mutual NDA</Label>
        <Tile style={{ gap: 4, paddingVertical: 8 }}>
          {sectionRow('nda', 'Mutual NDA', firstLine(draft.nda_markdown) || 'No NDA text came back', () => openEdit({ doc: 'nda', index: -1, title: 'Mutual NDA' }, draft.nda_markdown), 0)}
        </Tile>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Tell the assistant what to change</Label>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 6, justifyContent: 'center' }}>
            <TextInput style={{ fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 6, maxHeight: 100 }} multiline value={instruction} onChangeText={setInstruction} editable={!applying && !sending}
              placeholder="Add a rush fee, change the deposit, drop a clause" placeholderTextColor={C.slate} />
          </View>
          <Button label="Apply" onPress={() => apply(instruction)} busy={applying} disabled={!instruction.trim() || !!sending} style={{ height: 48, borderRadius: 24 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {QUICK.map(([l, instr]) => <Chip key={l} label={l} onPress={() => (applying || sending ? null : apply(instr))} />)}
        </ScrollView>
        {applying ? <Text style={T.sub}>Applying the change across the document</Text> : null}
      </View>

      <Button label="Finalize and send" icon="paper-plane-outline" onPress={confirmFinalize} busy={!!sending} disabled={applying || generating} />
      {sending ? <Text style={[T.sub, { textAlign: 'center' }]}>{sending}</Text> : null}
    </>
  );

  const doneView = () => (
    <>
      <Tile style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={30} color="#FFFFFF" />
        </View>
        <Text style={T.h3}>Agreement sent</Text>
        <Text style={[T.sub, { textAlign: 'center' }]}>{deliveryLine(done)}</Text>
      </Tile>
      {done.link ? (
        <Tile style={{ gap: 10 }}>
          <Label>Sign link</Label>
          <Text selectable style={[T.body, { fontSize: 13, color: C.slate }]}>{done.link}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Open" icon="open-outline" kind="white" small onPress={() => open(done.link)} />
            <Button label="Share" icon="share-outline" kind="white" small onPress={() => Share.share({ message: done.link }).catch(e => Alert.alert('Could not share', e.message))} />
          </View>
        </Tile>
      ) : (
        <Text style={[T.sub, { color: C.amber }]}>No sign link came back. Open the agreement in the web CRM to get one.</Text>
      )}
      {done.textError ? (
        <Tile style={{ gap: 10, backgroundColor: C.redSoft }}>
          <Text style={[T.body, { color: C.red }]}>The text did not go out: {done.textError}</Text>
          <Button label="Retry text" kind="white" small busy={retexting} onPress={retryText} style={{ alignSelf: 'flex-start' }} />
        </Tile>
      ) : null}
      {done.dealWarning ? <Text style={[T.sub, { color: C.amber }]}>Not linked as a deal on the pipeline: {done.dealWarning}. Approve it from the web CRM to link it.</Text> : null}
      <Button label="Back to the client" kind="soft" onPress={() => navigation.goBack()} />
    </>
  );

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <HeaderBar title="New agreement" sub={name} onBack={() => navigation.goBack()}
          right={<GradientChip label="Assistant" onPress={() => openAssistant({ prompt: `Help me with the service agreement for ${name}.${draft?.summary ? ` The current draft: ${draft.summary}` : ''}` })} />} />
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          {done ? doneView() : (
            <>
              {analysisBlock()}
              {draft ? draftView() : beforeDraft()}
            </>
          )}
        </ScrollView>

        {/* Section editor */}
        <Sheet visible={!!editing} title={editing ? `Edit · ${editing.title}` : 'Edit'} onClose={() => setEditing(null)}>
          <Text style={T.sub}>{editing?.doc === 'nda' ? 'The full NDA text. Markdown is fine.' : 'The heading stays as it is; edit the text under it. Markdown is fine.'}</Text>
          <TextInput style={[field, { minHeight: 240 }]} multiline value={editText} onChangeText={setEditText} autoFocus />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Cancel" kind="soft" onPress={() => setEditing(null)} />
            <Button label="Save" onPress={saveEdit} style={{ flex: 1 }} />
          </View>
        </Sheet>
      </KeyboardAvoidingView>
    </Screen>
  );
}
