import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAgreements, SIGN_BASE, PAY_BASE } from '../lib/api';
import { C, card } from '../lib/theme';

// The invoicing pipeline, mobile-sized: where the deal stands (drafted, sent,
// signed), what has been paid, and one-tap resend of the sign / pay links.
const AG_STEPS = ['draft', 'approved', 'sent', 'signed'];
const AG_LABELS = { draft: 'Drafted', approved: 'Approved', sent: 'Sent for signature', signed: 'Signed' };

export default function ClientDetailScreen({ route }) {
  const { client } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try { setData(await getAgreements(client.id)); }
    catch (e) { Alert.alert('Could not load pipeline', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const ag = (data?.agreements || [])[0] || null;
  const payments = data?.payments || [];
  const stepIdx = ag ? Math.max(AG_STEPS.indexOf(ag.status), 0) : -1;
  const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const shareLink = async (label, url) => {
    try { await Share.share({ message: url }); }
    catch { Alert.alert(label, url); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />}>

      {/* Client header */}
      <View style={card}>
        <Text style={{ color: C.text, fontSize: 19, fontWeight: '800' }}>{client.business_name || client.owner_name}</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
          {client.owner_name || ''}{client.contact_email ? ` · ${client.contact_email}` : ''}
        </Text>
        {!!client.potential_value && (
          <Text style={{ color: C.blue, fontWeight: '800', fontSize: 15, marginTop: 8 }}>
            ${Number(client.potential_value).toLocaleString()}{client.potential_value_type === 'monthly' ? '/month' : ' one-time'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {!!client.contact_email && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${client.contact_email}`)} style={btn()}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="mail-outline" size={15} color={C.text} /><Text style={btnT()}>Email</Text></View>
            </TouchableOpacity>
          )}
          {!!client.contact_phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${client.contact_phone}`)} style={btn()}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="call-outline" size={15} color={C.text} /><Text style={btnT()}>Call</Text></View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.blue} style={{ marginTop: 10 }} /> : (
        <>
          {/* Agreement pipeline */}
          <View style={card}>
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, marginBottom: 12 }}>Agreement</Text>
            {!ag ? (
              <Text style={{ color: C.muted, fontSize: 14 }}>No agreement yet. Draft it from the web CRM pipeline, then manage it here.</Text>
            ) : (
              <>
                {/* Step rail */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                  {AG_STEPS.map((s, i) => (
                    <React.Fragment key={s}>
                      <View style={{ alignItems: 'center', width: 74 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i <= stepIdx ? C.blue : C.surface3, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i <= stepIdx ? '✓' : i + 1}</Text>
                        </View>
                        <Text style={{ color: i <= stepIdx ? C.text : C.muted, fontSize: 10, marginTop: 4, textAlign: 'center' }}>{AG_LABELS[s]}</Text>
                      </View>
                      {i < AG_STEPS.length - 1 && <View style={{ flex: 1, height: 2, backgroundColor: i < stepIdx ? C.blue : C.surface3, marginTop: -14 }} />}
                    </React.Fragment>
                  ))}
                </View>
                <Text style={{ color: C.muted, fontSize: 13 }}>
                  {ag.title || 'Service Agreement'} · total {money(ag.total_amount)}
                  {ag.signed_at ? ` · signed ${new Date(ag.signed_at).toLocaleDateString()}` : ''}
                </Text>
                {!!ag.sign_token && !ag.signed_at && (
                  <TouchableOpacity onPress={() => shareLink('Sign link', `${SIGN_BASE}${ag.sign_token}`)} style={[btn(true), { marginTop: 12 }]}>
                    <Text style={btnT(true)}>Share sign link</Text>
                  </TouchableOpacity>
                )}
                {!!ag.sign_token && !!ag.signed_at && payments.some(p => p.status !== 'paid') && (
                  <TouchableOpacity onPress={() => shareLink('Payment link', `${PAY_BASE}${ag.sign_token}`)} style={[btn(true), { marginTop: 12 }]}>
                    <Text style={btnT(true)}>Share payment link</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Payments */}
          <View style={card}>
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Payments</Text>
            {payments.length === 0 ? (
              <Text style={{ color: C.muted, fontSize: 14 }}>No payment schedule yet.</Text>
            ) : payments.map(p => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 14 }}>{p.label || 'Payment'}</Text>
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 1 }}>
                    {p.due_condition || ''}{p.paid_at ? ` · paid ${new Date(p.paid_at).toLocaleDateString()}` : ''}
                  </Text>
                </View>
                <Text style={{ color: C.text, fontWeight: '800', marginRight: 10 }}>{money(p.amount)}</Text>
                <Text style={{ color: p.status === 'paid' ? C.green : C.amber, fontWeight: '800', fontSize: 11 }}>
                  {p.status === 'paid' ? 'PAID' : 'PENDING'}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const btn = (primary) => ({
  borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center',
  backgroundColor: primary ? C.blue : C.surface2, borderWidth: 1, borderColor: primary ? C.blue : C.border,
});
const btnT = (primary) => ({ color: primary ? '#fff' : C.text, fontWeight: '700', fontSize: 13.5 });
