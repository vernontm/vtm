import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Sheet from './Sheet';
import { draftNudge, sendNudge, askAssistant } from '../lib/api';
import { AUTOMATION_TITLES } from '../lib/templates';
import { C, T, F } from '../lib/theme';
import { Label, Button, Chip, GradientChip } from './ui';

// The nudge sheet: one tap from an unpaid invoice, a past-due plan or an
// unsigned agreement to a reminder the client actually gets. The server
// drafts it from the Automations template (POST /nudges?action=draft), the
// assistant can rewrite it, and it goes out now or tomorrow morning by text,
// email or both (POST /nudges). Open it with a target { kind, id } where kind
// is invoice | manual_invoice | payment | agreement | plan; null closes it.
// `onSent(reply)` fires after a successful send so the caller can refresh
// its "last nudged" line.

const TZ = 'America/Chicago';
const money = (v) => {
  const n = Number(v || 0);
  return `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// Date-only strings ("2026-09-23") are read as a local calendar day, not UTC
// midnight, so a due date never shows a day early.
const parseDate = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
};
const fmtDay = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const fmtDateTime = (s) => { const d = parseDate(s); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };

// Wall-clock parts of an instant in a time zone. Falls back to parsing the
// locale string on an engine without formatToParts.
function partsIn(date, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const x of f.formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value);
    return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
  } catch (_) {
    const s = date.toLocaleString('en-US', { timeZone: tz, hour12: false });
    const m = /(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/.exec(s);
    if (m) return { year: +m[3], month: +m[1], day: +m[2], hour: +m[4] % 24, minute: +m[5], second: +m[6] };
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
  }
}
// Offset (ms) between the zone's wall clock and UTC at that instant.
const offsetAt = (ms, tz) => {
  const p = partsIn(new Date(ms), tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
// Tomorrow at 8:00 AM Central as an ISO instant (safe across a DST switch).
export function tomorrowAt8Central() {
  const now = partsIn(new Date(), TZ);
  const wall = Date.UTC(now.year, now.month - 1, now.day + 1, 8, 0, 0);   // the wall clock, read as UTC
  let inst = wall - offsetAt(wall, TZ);
  inst = wall - offsetAt(inst, TZ);   // second pass in case the offset changes overnight
  return new Date(inst).toISOString();
}

// The assistant answers in plain text; drop wrapping quotes and any dashes
// it slipped in (house rule: none in anything we send).
const cleanReply = (s) => String(s || '').trim()
  .replace(/^["'“‘`]+|["'”’`]+$/g, '')
  .replace(/\s*\u2014\s*/g, ', ').replace(/\s*\u2013\s*/g, '-')
  .trim();

const REWRITES = [
  ['Shorter', 'Make it shorter: two sentences at most.'],
  ['Warmer', 'Make it warmer and more personal, like a note from someone they know.'],
  ['Firmer', 'Make it firmer and more direct about the payment being late, still polite.'],
];

export default function NudgeSheet({ target, onClose, onSent }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channels, setChannels] = useState({ text: false, email: false });
  const [message, setMessage] = useState('');
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [sending, setSending] = useState(null);   // 'now' | 'later'
  const [sent, setSent] = useState(null);         // { when, channels }
  const seq = useRef(0);
  const closeTimer = useRef(null);

  const kind = target?.kind;
  const id = target?.id;

  const load = () => {
    if (!kind || !id) return;
    const my = ++seq.current;
    setDraft(null); setError(null); setSent(null); setSending(null);
    setRewriteOpen(false); setInstruction(''); setMessage('');
    setChannels({ text: false, email: false });
    setLoading(true);
    draftNudge({ kind, id }).then(r => {
      if (my !== seq.current) return;
      setDraft(r || {});
      setMessage(String(r?.message || ''));
      setChannels({ text: !!r?.channels?.text?.available, email: !!r?.channels?.email?.available });
    }).catch(e => { if (my === seq.current) setError(e.message || 'Could not draft the nudge'); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  };
  // Keyed on the target object (callers pass a fresh one per tap), so
  // reopening the same invoice after a send starts clean.
  useEffect(() => { load(); }, [target]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const tgt = draft?.target || {};
  const label = tgt.label || target?.label || '';
  const clientName = tgt.client_name || target?.client_name || '';
  const subLine = [
    clientName || null,
    tgt.amount != null ? money(tgt.amount) : null,
    tgt.due ? `due ${fmtDay(tgt.due)}` : null,
    Number(tgt.days_late) > 0 ? `${tgt.days_late} ${Number(tgt.days_late) === 1 ? 'day' : 'days'} late` : null,
  ].filter(Boolean).join(' · ');
  const templateName = AUTOMATION_TITLES[draft?.template_key]?.title || String(draft?.template_key || 'Nudge').replace(/_/g, ' ');
  const picked = ['text', 'email'].filter(k => channels[k] && draft?.channels?.[k]?.available);
  const canSend = !!draft && !loading && picked.length > 0 && !!message.trim() && !sending && !rewriting;

  const rewrite = async (instr) => {
    const body = message.trim();
    if (!body) return Alert.alert('Nothing to rewrite', 'Write the nudge first.');
    const ask = String(instr || '').trim();
    if (!ask) return;
    setRewriting(true);
    try {
      const prompt = [
        `You are rewriting a short payment reminder that Vernon Tech & Media is about to send to ${clientName || 'a client'} by text or email. Keep every fact, amount, date and link exactly as they are, do not add anything that is not in the message, and do not use em dashes or en dashes.`,
        `Instruction: ${ask}`,
        `Current message:\n"""${body}"""`,
        'Reply with ONLY the rewritten message: no quotes, no preamble, no options.',
      ].join('\n\n');
      const r = await askAssistant(prompt, []);
      const out = cleanReply(r?.answer);
      if (!out) throw new Error('The assistant sent nothing back.');
      setMessage(out);
      setRewriteOpen(false); setInstruction('');
    } catch (e) { Alert.alert('Could not rewrite', e.message); }
    finally { setRewriting(false); }
  };

  const send = async (when) => {
    if (!picked.length) return Alert.alert('Pick how to send it', 'Turn on Text or Email first.');
    const body = message.trim();
    if (!body) return Alert.alert('Nothing to send', 'Write the nudge first.');
    setSending(when);
    try {
      const payload = { kind, id, channels: picked, message: body };
      if (draft?.email_subject) payload.email_subject = draft.email_subject;
      if (when === 'later') payload.schedule_at = tomorrowAt8Central();
      const r = await sendNudge(payload);
      const went = Array.isArray(r?.sent) && r.sent.length ? r.sent : picked;
      setSent({ when, channels: went, skipped: Array.isArray(r?.skipped) ? r.skipped : [] });
      closeTimer.current = setTimeout(() => { onSent && onSent(r); onClose && onClose(); }, 1100);
    } catch (e) { Alert.alert('Could not send the nudge', e.message); }
    finally { setSending(null); }
  };

  // Plain functions, not inner components: a component here would remount
  // on every keystroke and drop the keyboard focus in the draft box.
  const channelPill = (key, icon, title) => {
    const ch = draft?.channels?.[key] || {};
    const available = !!ch.available;
    const on = available && channels[key];
    return (
      <TouchableOpacity key={key} onPress={() => setChannels(c => ({ ...c, [key]: !c[key] }))} disabled={!available} activeOpacity={0.8}
        accessibilityRole="switch" accessibilityState={{ checked: on, disabled: !available }} accessibilityLabel={`${title} ${available ? ch.to : 'unavailable'}`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 14, borderRadius: 16, backgroundColor: on ? C.ink : C.tile, opacity: available ? 1 : 0.5 }}>
        <Ionicons name={icon} size={18} color={on ? '#FFFFFF' : C.ink} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[T.button, { color: on ? '#FFFFFF' : C.ink }]}>{title}</Text>
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12, color: on ? 'rgba(255,255,255,0.75)' : C.slate }]}>
            {available ? (ch.to || 'on file') : key === 'text' ? 'no number on file' : 'no email on file'}
          </Text>
        </View>
        {on ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </TouchableOpacity>
    );
  };

  const historyLine = (h, i) => {
    const chans = Array.isArray(h.channels) && h.channels.length ? h.channels.join(' and ') : 'nudge';
    const when = h.sent_at || h.scheduled_at || h.created_at;
    const status = h.status && h.status !== 'sent' ? ` · ${h.status}` : '';
    return (
      <Text key={i} style={[T.sub, { fontSize: 12 }]}>
        {h.by_name || 'Someone'} · {chans} · {fmtDateTime(when) || 'date unknown'}{status}
      </Text>
    );
  };

  const field = { minHeight: 110, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink, textAlignVertical: 'top' };

  return (
    <Sheet visible={!!target} title={label ? `Nudge · ${label}` : 'Nudge'} onClose={onClose}>
      {subLine ? <Text style={T.sub}>{subLine}</Text> : null}

      {sent ? (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={sent.when === 'later' ? 'time-outline' : 'checkmark'} size={28} color="#FFFFFF" />
          </View>
          <Text style={T.title}>{sent.when === 'later' ? 'Scheduled for tomorrow at 8 AM' : 'Nudge sent'}</Text>
          <Text style={T.sub}>By {sent.channels.join(' and ')}{sent.skipped.length ? ` · skipped ${sent.skipped.join(' and ')}` : ''}</Text>
        </View>
      ) : loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.tile }}>
          <ActivityIndicator color={C.ink} size="small" />
          <Text style={T.sub}>Writing the nudge from the template</Text>
        </View>
      ) : error ? (
        <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.redSoft }}>
          <Text style={[T.body, { color: C.red }]}>{error}</Text>
          <Button label="Try again" kind="white" small onPress={load} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : draft ? (
        <>
          <View style={{ gap: 8 }}>
            <Label>Send by</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {channelPill('text', 'chatbubble-outline', 'Text')}
              {channelPill('email', 'mail-outline', 'Email')}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Label right={rewriting ? <ActivityIndicator color={C.violet} size="small" /> : null}>{`Draft · ${templateName}`}</Label>
            <TextInput style={[field, { opacity: rewriting ? 0.6 : 1 }]} multiline value={message} onChangeText={setMessage} editable={!rewriting && !sending}
              placeholder="Write the nudge" placeholderTextColor={C.slate} />
            {channels.email && draft.email_subject ? <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>Email subject: {draft.email_subject}</Text> : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            <GradientChip label="Rewrite with the assistant" onPress={() => setRewriteOpen(o => !o)} />
            {REWRITES.map(([l, instr]) => <Chip key={l} label={l} onPress={() => rewrite(instr)} />)}
          </ScrollView>

          {rewriteOpen ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: C.tile, paddingHorizontal: 16, justifyContent: 'center' }}>
                <TextInput style={{ fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 10 }} value={instruction} onChangeText={setInstruction}
                  placeholder="Tell it what to change" placeholderTextColor={C.slate} returnKeyType="send" onSubmitEditing={() => rewrite(instruction)} autoFocus />
              </View>
              <TouchableOpacity onPress={() => rewrite(instruction)} disabled={rewriting || !instruction.trim()} accessibilityLabel="Rewrite"
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (rewriting || !instruction.trim()) ? 0.5 : 1 }}>
                {rewriting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="arrow-up" size={20} color="#FFFFFF" />}
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Send nudge" icon="paper-plane-outline" onPress={() => send('now')} busy={sending === 'now'} disabled={!canSend} style={{ flex: 1 }} />
            <Button label="Tomorrow 8 AM" icon="time-outline" kind="soft" onPress={() => send('later')} busy={sending === 'later'} disabled={!canSend} />
          </View>
          {!picked.length ? <Text style={[T.sub, { fontSize: 12 }]}>Turn on Text or Email to send.</Text> : null}

          <View style={{ gap: 4 }}>
            <Label>Sent before</Label>
            {Array.isArray(draft.history) && draft.history.length
              ? draft.history.slice(0, 6).map(historyLine)
              : <Text style={[T.sub, { fontSize: 12 }]}>Not nudged yet.</Text>}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
