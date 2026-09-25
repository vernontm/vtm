import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import Sheet from '../components/Sheet';
import { getClients, createClient, getMe, getContacts, createContact } from '../lib/api';
import { goToConversation } from '../lib/nav';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, Tile, IconButton, Button, Chip, Avatar, Dot, Empty, TEMP, DOCK_SPACE } from '../components/ui';
import { firstName, colorForEmployee } from '../lib/imsg';

// People (Aura): admins see Clients as a card grid, Leads as a heat list and
// Contacts as a list. Team members (Naqiya) see Contacts only, addable on the
// spot. Every card carries a message button straight into the iMessage inbox.
const TABS = ['clients', 'leads', 'contacts'];

// Journey stages as colored text: green is live, blue is in motion, slate is
// paused, amber is still a lead. Unknown stages fall back to slate.
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

// Lead heat: the shared hot / warm / cold set plus the two pipeline states the
// web CRM writes into the same column.
const HEAT_EXTRA = {
  contract_sent: { label: 'Contract sent', color: C.blue, dot: C.blue },
  won: { label: 'Won', color: C.green, dot: C.green },
};
const HEAT_RANK = { hot: 0, warm: 1, contract_sent: 2, won: 3, cold: 4 };
const heatOf = (k) => TEMP[k] || HEAT_EXTRA[k] || { label: 'No heat yet', color: C.slate, dot: '#64748B' };

const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const CONTACT_VERB = { text: 'texted', sms: 'texted', imessage: 'texted', call: 'called', phone: 'called', email: 'emailed', meeting: 'met' };
const lastContact = (c) => {
  if (c.last_contact_at) return `${CONTACT_VERB[c.last_contact_channel] || 'last contact'} ${fmtDay(c.last_contact_at)}`;
  const added = fmtDay(c.created_at || c.updated_at);
  return added ? `added ${added}` : 'no contact yet';
};
const money = (v, t) => (v ? `$${Number(v).toLocaleString()}${t === 'monthly' ? '/mo' : ''}` : '');
const phoneOf = (c) => c.contact_phone || c.phone || null;
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The message circle on a card. White on a tile, tile-colored on a white card,
// ink when `dark`. Only rendered when there is a number to text.
function MessageButton({ name, phone, dark = false, onWhite = false, size = 40 }) {
  if (!phone) return null;
  const bg = dark ? C.ink : onWhite ? C.tile : '#FFFFFF';
  return (
    <TouchableOpacity onPress={() => goToConversation(phone)} accessibilityLabel={`Message ${name}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={dark ? 'chatbubble' : 'chatbubble-outline'} size={dark ? 20 : 18} color={dark ? '#FFFFFF' : C.ink} />
    </TouchableOpacity>
  );
}

// Who owns the lead: a small pill with their color, or a dashed "Assign".
function AssigneePill({ c, onWhite }) {
  if (c.assigned_to_name) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: onWhite ? C.tile : '#FFFFFF' }}>
        <Dot size={14} color={colorForEmployee(c.assigned_to || c.assigned_to_name)} />
        <Text style={T.meta}>{firstName(c.assigned_to_name)}</Text>
      </View>
    );
  }
  return (
    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(11,11,16,0.3)', justifyContent: 'center' }}>
      <Text style={T.meta}>Assign</Text>
    </View>
  );
}

// Clients: a grid card. Paused clients sit on white so the live ones read first.
function ClientCard({ c, onOpen }) {
  const st = stageOf(c.stage);
  const paused = c.stage === 'paused';
  const name = c.business_name || c.owner_name || 'Client';
  const value = money(c.potential_value, c.potential_value_type);
  return (
    <Tile white={paused} onPress={onOpen} style={{ flex: 1, minHeight: 150, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Avatar name={name} size={44} tone={paused ? 'tile' : 'white'} />
        <MessageButton name={name} phone={phoneOf(c)} onWhite={paused} />
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={2} style={[T.title, { fontSize: 16, lineHeight: 20 }]}>{name}</Text>
        {c.owner_name && c.owner_name !== name ? <Text numberOfLines={1} style={T.sub}>{c.owner_name}</Text> : null}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {value ? <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: C.ink, flexShrink: 1 }}>{value}</Text> : null}
        <Text style={[T.meta, { color: st.color }]}>{st.label}</Text>
      </View>
    </Tile>
  );
}

// Leads: a list tile with heat, last contact and owner. Cold or unrated leads
// sit on white; hot and warm ones on a tile.
function LeadTile({ c, onOpen }) {
  const heat = heatOf(c.lead_temperature);
  const quiet = !c.lead_temperature || c.lead_temperature === 'cold';
  const name = c.business_name || c.owner_name || 'Lead';
  const sub = [c.owner_name && c.owner_name !== name ? c.owner_name : null, c.source || c.lead_source || null, lastContact(c)].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.75}
      style={{ gap: 10, padding: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: quiet ? C.bg : C.tile, borderWidth: quiet ? 1 : 0, borderColor: C.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} size={44} tone={quiet ? 'tile' : 'white'} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={T.title}>{name}</Text>
          <Text numberOfLines={1} style={T.sub}>{sub}</Text>
        </View>
        <MessageButton name={name} phone={phoneOf(c)} dark={!quiet} onWhite={quiet} size={44} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Dot color={heat.dot} />
        <Text numberOfLines={1} style={[T.meta, { color: heat.color, flexShrink: 1 }]}>
          {heat.label}{c.follow_up_due_date ? ` · follow up ${fmtDay(c.follow_up_due_date)}` : ''}
        </Text>
        <View style={{ flex: 1 }} />
        <AssigneePill c={c} onWhite={quiet} />
      </View>
    </TouchableOpacity>
  );
}

// Contacts: name, where they work, how to reach them.
function ContactTile({ c }) {
  const name = c.name || 'Contact';
  const sub = [c.company, c.email || c.phone].filter(Boolean).join(' · ') || 'No details yet';
  return (
    <View style={{ gap: 8, padding: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.tile }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} size={44} tone="white" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={T.title}>{name}</Text>
          <Text numberOfLines={1} style={T.sub}>{sub}</Text>
        </View>
        <MessageButton name={name} phone={c.phone} />
      </View>
      {c.notes ? <Text numberOfLines={2} style={[T.sub, { paddingLeft: 56 }]}>{c.notes}</Text> : null}
    </View>
  );
}

export default function ClientsScreen({ navigation, route }) {
  const wantTab = route?.params?.tab;
  const [isAdmin, setIsAdmin] = useState(null);   // null = booting
  const [clients, setClients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(TABS.includes(wantTab) ? wantTab : 'clients');   // clients | leads | contacts
  const [showAdd, setShowAdd] = useState(false);

  // The screen draws its own header; keep the native one off if the navigator still shows it.
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const admin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
      setIsAdmin(admin);
      if (!admin) setTab('contacts');
    });
  }, []);
  // Home's Leads tile lands on the Leads tab; the param can change while mounted.
  useEffect(() => { if (TABS.includes(wantTab) && isAdmin !== false) setTab(wantTab); }, [wantTab]);

  const load = useCallback(async (quiet) => {
    if (isAdmin === null) return;
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      let wsId = workspaceId;
      if (!wsId) {
        const me = await getMe();
        wsId = me?.clients?.[0]?.id || null;
        setWorkspaceId(wsId);
      }
      const [cl, ct] = await Promise.all([
        isAdmin ? getClients().catch(() => []) : Promise.resolve([]),
        wsId ? getContacts(wsId).catch(() => []) : Promise.resolve([]),
      ]);
      if (isAdmin) setClients(cl || []);
      setContacts(ct || []);
    } catch (e) { Alert.alert('Could not load', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [isAdmin, workspaceId]);
  useEffect(() => { load(); }, [load]);

  const tabs = isAdmin === null ? [] : isAdmin ? TABS : ['contacts'];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const has = (v) => (v || '').toLowerCase().includes(needle);
    if (tab === 'contacts') {
      return (contacts || []).filter(c => !needle || has(c.name) || has(c.email) || has(c.company) || has(c.phone));
    }
    const arr = (clients || [])
      .filter(c => tab === 'leads' ? c.stage === 'lead' : c.stage !== 'lead')
      .filter(c => !needle || has(c.business_name) || has(c.owner_name) || has(c.contact_phone) || has(c.contact_email))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    // Leads read by heat first, then by recency.
    if (tab === 'leads') arr.sort((a, b) => (HEAT_RANK[a.lead_temperature] ?? 9) - (HEAT_RANK[b.lead_temperature] ?? 9));
    return arr;
  }, [clients, contacts, q, tab]);

  // The client grid is two cards per row; a lone last card keeps its half width.
  const gridRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
    return rows;
  }, [list]);

  const nClients = clients.filter(c => c.stage !== 'lead').length;
  const nLeads = clients.length - nClients;
  const sub = isAdmin
    ? `${count(nClients, 'client')} · ${count(nLeads, 'lead')} · ${count(contacts.length, 'contact')}`
    : count(contacts.length, 'contact');
  const booting = isAdmin === null || loading;

  const empty = q.trim()
    ? { title: 'No matches', sub: 'Try another name, business or phone.' }
    : tab === 'contacts' ? { title: 'No contacts yet', sub: 'Tap + to add someone you talked to.' }
    : tab === 'leads' ? { title: 'No leads yet', sub: 'Tap + to add a lead you are working.' }
    : { title: 'No clients yet', sub: 'Signed clients show up here.' };

  const open = (c) => navigation.navigate('ClientDetail', { client: c });

  return (
    <Screen>
      <HeaderBar title="People" sub={sub} onBack={() => navigation.goBack()}
        right={<IconButton icon="add" dark label={tab === 'contacts' ? 'Add a contact' : tab === 'leads' ? 'Add a lead' : 'Add a client'} onPress={() => setShowAdd(true)} />} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: C.tile }}>
          <Ionicons name="search" size={18} color={C.slate} />
          <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 0 }} placeholder="Search by name, business or phone" placeholderTextColor={C.slate}
            value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
          {q ? <TouchableOpacity onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={C.slate} /></TouchableOpacity> : null}
        </View>
        {tabs.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tabs.map(t => <Chip key={t} label={cap(t)} active={tab === t} onPress={() => setTab(t)} />)}
          </View>
        ) : null}
      </View>

      {booting ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
        <FlatList
          key={tab}
          data={tab === 'clients' ? gridRows : list}
          keyExtractor={(item, i) => (tab === 'clients' ? item.map(c => c.id).join('-') || String(i) : item.id)}
          contentContainerStyle={{ padding: 18, paddingBottom: DOCK_SPACE, gap: tab === 'clients' ? 12 : 10 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}
          ListEmptyComponent={<Empty icon="people-outline" title={empty.title} sub={empty.sub} />}
          renderItem={({ item }) => {
            if (tab === 'clients') {
              return (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {item.map(c => <ClientCard key={c.id} c={c} onOpen={() => open(c)} />)}
                  {item.length === 1 ? <View style={{ flex: 1 }} /> : null}
                </View>
              );
            }
            if (tab === 'leads') return <LeadTile c={item} onOpen={() => open(item)} />;
            return <ContactTile c={item} />;
          }}
        />
      )}

      {tab === 'contacts' ? (
        <AddContactModal visible={showAdd} workspaceId={workspaceId} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(true); }} />
      ) : (
        <AddClientModal visible={showAdd} defaultKind={tab} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(true); }} />
      )}
    </Screen>
  );
}

// Sheet form fields: a tile input, no border.
const field = { minHeight: 48, backgroundColor: C.tile, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink, minWidth: 0 };

function AddClientModal({ visible, defaultKind, onClose, onCreated }) {
  const [kind, setKind] = useState(defaultKind);
  const [business, setBusiness] = useState('');
  const [owner, setOwner] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) setKind(defaultKind); }, [visible, defaultKind]);
  const noun = kind === 'leads' ? 'lead' : 'client';

  const save = async () => {
    if (!business.trim() && !owner.trim()) return Alert.alert('Add a business or contact name');
    setBusy(true);
    try {
      await createClient({
        business_name: business.trim() || owner.trim(),
        owner_name: owner.trim(),
        contact_email: email.trim().toLowerCase(),
        contact_phone: phone.trim() || null,
        notes: notes.trim() || null,
        stage: kind === 'leads' ? 'lead' : 'onboarding',
        lead_temperature: 'warm',
        source: 'mobile',
      });
      setBusiness(''); setOwner(''); setEmail(''); setPhone(''); setNotes('');
      onCreated();
    } catch (e) { Alert.alert('Could not create', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title={`New ${noun}`} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Lead" active={kind === 'leads'} onPress={() => setKind('leads')} />
        <Chip label="Client" active={kind === 'clients'} onPress={() => setKind('clients')} />
      </View>
      <TextInput style={field} placeholder="Business name" placeholderTextColor={C.slate} value={business} onChangeText={setBusiness} />
      <TextInput style={field} placeholder="Contact name" placeholderTextColor={C.slate} value={owner} onChangeText={setOwner} />
      <TextInput style={field} placeholder="Email" placeholderTextColor={C.slate} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={field} placeholder="Phone" placeholderTextColor={C.slate} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={[field, { minHeight: 88, textAlignVertical: 'top' }]} placeholder="Notes: where you met, what they need, next step" placeholderTextColor={C.slate} multiline value={notes} onChangeText={setNotes} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button label="Cancel" kind="soft" onPress={onClose} style={{ flex: 1 }} />
        <Button label={`Add ${noun}`} onPress={save} busy={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function AddContactModal({ visible, workspaceId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Add their name');
    if (!workspaceId) return Alert.alert('Could not find your workspace. Pull to refresh and try again.');
    setBusy(true);
    try {
      await createContact(workspaceId, {
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      setName(''); setCompany(''); setEmail(''); setPhone(''); setNotes('');
      onCreated();
    } catch (e) { Alert.alert('Could not save contact', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="New contact" onClose={onClose}>
      <TextInput style={field} placeholder="Name *" placeholderTextColor={C.slate} value={name} onChangeText={setName} />
      <TextInput style={field} placeholder="Business / where they work" placeholderTextColor={C.slate} value={company} onChangeText={setCompany} />
      <TextInput style={field} placeholder="Email" placeholderTextColor={C.slate} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={field} placeholder="Phone" placeholderTextColor={C.slate} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={[field, { minHeight: 88, textAlignVertical: 'top' }]} placeholder="Notes: where you met them, what you talked about" placeholderTextColor={C.slate} multiline value={notes} onChangeText={setNotes} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button label="Cancel" kind="soft" onPress={onClose} style={{ flex: 1 }} />
        <Button label="Add contact" onPress={save} busy={busy} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}
