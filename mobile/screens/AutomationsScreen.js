import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { getSettings, bulkUpdateSettings } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, Tile, Label, Chip, Segmented, Button, Check, Empty, DOCK_SPACE } from '../components/ui';
import { DEFAULT_AUTOMATIONS, PLACEHOLDERS, SAMPLE_VARS, fillTemplate, parseAutomations } from '../lib/templates';

// Automations (admins): the texts the CRM sends on its own, as editable
// templates with placeholders, so every automated message reads the same.
const HOURS = [7, 8, 9, 10];
const fmtHour = (h) => `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;

export default function AutomationsScreen({ navigation }) {
  const [me, setMe] = useState(null);
  const [auto, setAuto] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {});
    getSettings().then(rows => setAuto(parseAutomations(rows))).catch(() => setAuto({ ...DEFAULT_AUTOMATIONS }));
  }, []);
  const isAdmin = !!(me?.user_metadata?.is_admin || me?.app_metadata?.is_admin);

  const set = (key, patch) => setAuto(a => ({ ...a, [key]: { ...a[key], ...patch } }));
  const save = async () => {
    setSaving(true);
    try { await bulkUpdateSettings([{ key: 'automations', value: JSON.stringify(auto) }]); Alert.alert('Saved', 'New texts will use these templates.'); }
    catch (e) { Alert.alert('Could not save', e.message); }
    finally { setSaving(false); }
  };

  const field = { minHeight: 96, borderRadius: 16, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink, textAlignVertical: 'top' };
  const insert = (key, p) => { const v = auto[key].template || ''; set(key, { template: `${v}${v && !/\s$/.test(v) ? ' ' : ''}{${p}}` }); };

  // A plain function, not a component: an inner component would remount on
  // every keystroke and drop the keyboard focus in the template field.
  const card = (k, title, sub, extra) => (
    <Tile key={k} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>{title}</Text>
          <Text style={T.sub}>{sub}</Text>
        </View>
        <Check done={auto[k].enabled !== false} onPress={() => set(k, { enabled: auto[k].enabled === false })} label={`${title} on`} />
      </View>
      {extra}
      <Segmented value={auto[k].mode === 'assistant' ? 'assistant' : 'template'} onChange={(v) => set(k, { mode: v })}
        options={[{ value: 'template', label: 'Use the template' }, { value: 'assistant', label: 'Assistant writes it' }]} />
      <Text style={T.sub}>{auto[k].mode === 'assistant' ? 'The assistant writes each one fresh, matching the tone and length of your template.' : 'Sent exactly as written, with the placeholders filled in.'}</Text>
      <TextInput style={field} multiline value={auto[k].template} onChangeText={(t) => set(k, { template: t })} placeholder="Write the message" placeholderTextColor={C.slate} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {PLACEHOLDERS[k].map(p => <Chip key={p} label={`{${p}}`} onPress={() => insert(k, p)} style={{ backgroundColor: '#FFFFFF' }} />)}
      </ScrollView>
      <View style={{ gap: 4 }}>
        <Label>Preview</Label>
        <Text style={[T.body, { fontSize: 14 }]}>{fillTemplate(auto[k].template, SAMPLE_VARS) || '(empty)'}</Text>
      </View>
    </Tile>
  );

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <HeaderBar title="Automations" sub="Texts the CRM sends on its own" onBack={() => navigation.goBack()} />
        {!auto ? null : !isAdmin ? (
          <Empty icon="flash-outline" title="Admins only" sub="Ask Ray to change the automation templates." />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE, gap: 14 }} keyboardShouldPersistTaps="handled">
            {card('thank_you', 'Thank-you after an in-person meetup', 'Goes out the morning after any in-person meeting with a known number.', (
              <View style={{ gap: 6 }}>
                <Label>Send at</Label>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {HOURS.map(h => <Chip key={h} label={fmtHour(h)} active={Number(auto.thank_you.send_hour) === h} onPress={() => set('thank_you', { send_hour: h })} style={Number(auto.thank_you.send_hour) === h ? null : { backgroundColor: '#FFFFFF' }} />)}
                </View>
                <Text style={T.sub}>Central time, the day after the meeting ends.</Text>
              </View>
            ))}
            {card('meeting_confirmation', 'Meeting confirmation', 'Texted when you tap Create meeting in a conversation. {link} becomes the Meet link, or the address for in-person.', null)}
            {card('invoice_reminder', 'Invoice nudge', 'What Nudge sends for an unpaid invoice, by text and email. {link} is the pay link.', null)}
            {card('agreement_reminder', 'Agreement nudge', 'What Nudge sends for an agreement that has not been signed. {link} is the sign link.', null)}
            {card('plan_past_due', 'Plan past due', 'What Nudge sends when a client plan payment fails. {link} lets them update the card.', null)}
            <Button label="Save templates" onPress={save} busy={saving} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
