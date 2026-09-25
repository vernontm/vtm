import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { C, T, F } from '../lib/theme';
import { Screen, Button } from '../components/ui';

// Sign in (Aura): the mark, a display headline, two tile fields, one ink pill.
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

  const field = { height: 52, backgroundColor: C.tile, borderRadius: 16, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink };

  return (
    <Screen aurora>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 26 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <Text style={{ fontFamily: F.display, fontSize: 30, lineHeight: 34, color: '#FFFFFF', letterSpacing: -1 }}>V</Text>
          </View>
          <Text style={T.label}>{'Vernon Tech & Media'}</Text>
          <Text style={[T.h1, { textAlign: 'center' }]}>Sign in</Text>
          <Text style={[T.sub, { textAlign: 'center', marginTop: -4 }]}>Use your CRM login</Text>
        </View>
        <View style={{ gap: 12 }}>
          <TextInput style={field} placeholder="Email" placeholderTextColor={C.slate} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} />
          <TextInput style={field} placeholder="Password" placeholderTextColor={C.slate} secureTextEntry textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={signIn} />
          {!!error && <Text style={[T.sub, { color: C.red, textAlign: 'center' }]}>{error}</Text>}
          <Button label="Sign in" onPress={signIn} busy={busy} disabled={!email || !password} style={{ height: 52, borderRadius: 26, marginTop: 4 }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
