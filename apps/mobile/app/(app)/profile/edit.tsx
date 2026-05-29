import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../../src/auth/store';
import { api, ApiError } from '../../../src/api/client';

// Edit name + email. Phone is the account identity and isn't editable here.
export default function EditProfileScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session) {
      setFullName(session.user.fullName);
      setEmail(session.user.email ?? '');
    }
  }, [session]);

  if (!session) return null;

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert('Name', 'Please enter your name.');
      return;
    }
    const trimmedEmail = email.trim();
    setSaving(true);
    try {
      const res = await api.updateProfile({
        fullName: trimmedName,
        email: trimmedEmail ? trimmedEmail : null,
      });
      // Keep the cached session user in sync so other screens reflect the change.
      await setSession({ ...session, user: res.user });
      router.back();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not save changes.';
      Alert.alert('Profile', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Edit profile</Text>
        <View className="h-10 w-10" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="px-5 pt-6">
            <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
              Your{' '}
              <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
                details.
              </Text>
            </Text>
          </View>

          <View className="px-5 mt-8">
            <Field label="Full name">
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Aluoch Achieng"
                placeholderTextColor="#A09886"
                className="text-text text-base"
              />
            </Field>

            <Field label="Email (optional)">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#A09886"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="text-text text-base"
              />
            </Field>

            <View className="mt-4 rounded-lg bg-bg-muted px-4 py-3">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Phone</Text>
              <Text className="text-text text-base mt-1">{session.user.phone}</Text>
              <Text className="text-text-muted text-xs mt-1">Contact support to change your phone number.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="absolute left-5 right-5 bottom-8">
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="items-center rounded-lg bg-gold px-4 py-4"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Save changes</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="text-text-muted text-xs uppercase tracking-widest mb-2">{label}</Text>
      <View className="rounded-lg bg-surface border border-border px-4 py-3">{children}</View>
    </View>
  );
}
