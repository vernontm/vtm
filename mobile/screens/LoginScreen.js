import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { C, card } from '../lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) setError(error.message);
    setBusy(false);
  };

  const input = {
    backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: C.text, marginBottom: 12,
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View style={{ width: 56, height: 56, borderRadius: 15, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>V</Text>
        </View>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }}>Vernon Tech &amp; Media</Text>
        <Text style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Sign in to the CRM</Text>
      </View>
      <View style={card}>
        <TextInput style={input} placeholder="Email" placeholderTextColor={C.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={input} placeholder="Password" placeholderTextColor={C.muted} secureTextEntry value={password} onChangeText={setPassword} />
        {!!error && <Text style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{error}</Text>}
        <TouchableOpacity onPress={signIn} disabled={busy || !email || !password}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', opacity: busy || !email || !password ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Sign in</Text>}
        </TouchableOpacity>
      </View>
      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>Same account as the web CRM.</Text>
    </KeyboardAvoidingView>
  );
}
