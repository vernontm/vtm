import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import Sheet from '../components/Sheet';
import { getClients, createClient, getMe, getContacts, createContact } from '../lib/api';
import { C, card } from '../lib/theme';

const STAGE_COLORS = { lead: C.amber, onboarding: C.blue, in_build: '#7c3aed', live: C.green, scoping: C.muted };

// Admins see the full business: Clients, Leads, and Contacts.
// Team members (Naqiya) see Contacts: the people they talk to, addable on the spot.
export default function ClientsScreen({ navigation }) {
  const [isAdmin, setIsAdmin] = useState(null);   // null = booting
  const [clients, setClients] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('clients');   // clients | leads | contacts
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const admin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
      setIsAdmin(admin);
      if (!admin) setTab('contacts');
    });
  }, []);

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

  const tabs = isAdmin ? ['clients', 'leads', 'contacts'] : ['contacts'];

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (tab === 'contacts') {
      return (contacts || []).filter(c => !needle
        || (c.name || '').toLowerCase().includes(needle)
        || (c.email || '').toLowerCase().includes(needle)
        || (c.company || '').toLowerCase().includes(needle));
    }
    return (clients || [])
      .filter(c => tab === 'leads' ? c.stage === 'lead' : c.stage !== 'lead')
      .filter(c => !needle || (c.business_name || '').toLowerCase().includes(needle) || (c.owner_name || '').toLowerCase().includes(needle))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [clients, contacts, q, tab]);

  const money = (v, t) => v ? `$${Number(v).toLocaleString()}${t === 'monthly' ? '/mo' : ''}` : '';

  if (isAdmin === null || loading) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ActivityIndicator color={C.blue} style={{ marginTop: 40 }} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
      {tabs.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {tabs.map(t => (
            <TouchableOpacity key={t} onPress={() => setTab(t)}
              style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: tab === t ? C.blue : C.surface2, borderWidth: 1, borderColor: tab === t ? C.blue : C.border }}>
              <Text style={{ color: tab === t ? '#fff' : C.muted, fontWeight: '700', textTransform: 'capitalize' }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput
        style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12, minWidth: 0 }}
        placeholder={`Search ${tab}…`} placeholderTextColor={C.muted} value={q} onChangeText={setQ}
      />
      <FlatList
        data={list}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />}
        ListEmptyComponent={<Text style={{ color: C.muted, textAlign: 'center', marginTop: 30 }}>
          {tab === 'contacts' ? 'No contacts yet. Tap + to add someone you talked to.' : `No ${tab} found.`}
        </Text>}
        renderItem={({ item: c }) => tab === 'contacts' ? (
          <View style={[card, { padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ color: C.blue, fontWeight: '800', fontSize: 16 }}>{(c.name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{c.name}</Text>
              <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
                {[c.company, c.email || c.phone].filter(Boolean).join(' · ') || 'No details yet'}
              </Text>
              {!!c.notes && <Text numberOfLines={2} style={{ color: C.muted, fontSize: 12, marginTop: 3, fontStyle: 'italic' }}>{c.notes}</Text>}
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => navigation.navigate('ClientDetail', { client: c })}
            style={[card, { padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }]}>
            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Text style={{ color: C.blue, fontWeight: '800', fontSize: 16 }}>{(c.business_name || '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{c.business_name || c.owner_name}</Text>
              <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
                {c.owner_name ? `${c.owner_name} · ` : ''}{money(c.potential_value, c.potential_value_type)}
              </Text>
            </View>
            <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: `${STAGE_COLORS[c.stage] || C.muted}22`, borderWidth: 1, borderColor: `${STAGE_COLORS[c.stage] || C.muted}55` }}>
              <Text style={{ color: STAGE_COLORS[c.stage] || C.muted, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' }}>{(c.stage || '').replace('_', ' ')}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity onPress={() => setShowAdd(true)}
        style={{ position: 'absolute', bottom: 24, right: 20, backgroundColor: C.blue, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 }}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

      {tab === 'contacts' ? (
        <AddContactModal visible={showAdd} workspaceId={workspaceId} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(true); }} />
      ) : (
        <AddClientModal visible={showAdd} defaultKind={tab} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(true); }} />
      )}
    </View>
  );
}

const inputStyle = { backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: C.text, minWidth: 0 };


function AddClientModal({ visible, defaultKind, onClose, onCreated }) {
  const [kind, setKind] = useState(defaultKind);
  const [business, setBusiness] = useState('');
  const [owner, setOwner] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) setKind(defaultKind); }, [visible, defaultKind]);
  const chip = (on) => ({ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1.5, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.blueSoft : C.surface2 });

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
    <Sheet visible={visible} title={`New ${kind === 'leads' ? 'lead' : 'client'}`} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={chip(kind === 'leads')} onPress={() => setKind('leads')}><Text style={{ color: kind === 'leads' ? C.blue : C.muted, fontWeight: '700' }}>Lead</Text></TouchableOpacity>
        <TouchableOpacity style={chip(kind === 'clients')} onPress={() => setKind('clients')}><Text style={{ color: kind === 'clients' ? C.blue : C.muted, fontWeight: '700' }}>Client</Text></TouchableOpacity>
      </View>
      <TextInput style={inputStyle} placeholder="Business name" placeholderTextColor={C.muted} value={business} onChangeText={setBusiness} />
      <TextInput style={inputStyle} placeholder="Contact name" placeholderTextColor={C.muted} value={owner} onChangeText={setOwner} />
      <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={inputStyle} placeholder="Phone" placeholderTextColor={C.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="Notes: where you met, what they need, next step…" placeholderTextColor={C.muted} multiline value={notes} onChangeText={setNotes} />
      <TouchableOpacity onPress={save} disabled={busy} style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Saving…' : `Add ${kind === 'leads' ? 'lead' : 'client'}`}</Text>
      </TouchableOpacity>
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
      <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={C.muted} value={name} onChangeText={setName} />
      <TextInput style={inputStyle} placeholder="Business / where they work" placeholderTextColor={C.muted} value={company} onChangeText={setCompany} />
      <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={inputStyle} placeholder="Phone" placeholderTextColor={C.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]} placeholder="Notes: where you met them, what you talked about…" placeholderTextColor={C.muted} multiline value={notes} onChangeText={setNotes} />
      <TouchableOpacity onPress={save} disabled={busy} style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Saving…' : 'Add contact'}</Text>
      </TouchableOpacity>
    </Sheet>
  );
}
