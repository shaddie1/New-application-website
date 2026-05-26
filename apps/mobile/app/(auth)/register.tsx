import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, ApiError } from '../../src/api/client';
import { useAuthStore } from '../../src/auth/store';

// Mockup 02 — finish account creation. Phone is already verified at this point.
export default function RegisterScreen() {
  const router = useRouter();
  const { registrationToken, phone } = useLocalSearchParams<{ registrationToken: string; phone: string }>();
  const setSession = useAuthStore((s) => s.setSession);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!registrationToken) {
      Alert.alert('Session expired', 'Please verify your phone again.');
      router.replace('/(auth)/sign-in');
      return;
    }
    if (!fullName.trim()) {
      Alert.alert('Full name', 'Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.register({
        registrationToken,
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        defaultAddress: addressLine.trim() ? { label: 'Home', line1: addressLine.trim() } : undefined,
        referralCode: referralCode.trim() || undefined,
      });
      await setSession(res.session);
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not finish sign-up.';
      Alert.alert('Sign up', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="flex-1 px-6 pt-12">
            <Pressable onPress={() => router.back()} className="self-start">
              <Text className="text-text-muted text-2xl">←</Text>
            </Pressable>

            <View className="mt-8">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Create an account</Text>
              <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
                Join the{' '}
                <Text className="text-gold-deep italic">Hawk circle.</Text>
              </Text>
              <Text className="text-text-muted mt-3 text-base">
                Earn points on every clean. Member-only rates after your fifth booking.
              </Text>
            </View>

            <View className="mt-10 gap-4">
              <Field label="Full name">
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Aluoch Achieng"
                  autoComplete="name"
                  className="text-text text-base"
                  placeholderTextColor="#A09886"
                />
              </Field>

              <View>
                <Text className="text-text-muted text-xs uppercase tracking-widest">Phone</Text>
                <View className="mt-2 flex-row items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                  <Text className="text-text text-base">{phone}</Text>
                  <View className="rounded-pill bg-service-residential/20 px-3 py-1">
                    <Text className="text-service-residential text-xs">✓ Verified</Text>
                  </View>
                </View>
              </View>

              <Field label="Email (optional)">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="aluoch@email.co.ke"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  className="text-text text-base"
                  placeholderTextColor="#A09886"
                />
              </Field>

              <Field label="Default address (optional)">
                <TextInput
                  value={addressLine}
                  onChangeText={setAddressLine}
                  placeholder="Riverside Drive · Apt 14B, Westlands"
                  className="text-text text-base"
                  placeholderTextColor="#A09886"
                />
              </Field>

              <Field label="Referral code (optional)">
                <TextInput
                  value={referralCode}
                  onChangeText={(v) => setReferralCode(v.toUpperCase())}
                  placeholder="ABCDEF"
                  autoCapitalize="characters"
                  className="text-text text-base tracking-widest"
                  placeholderTextColor="#A09886"
                  maxLength={8}
                />
              </Field>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="mt-8 items-center rounded-lg bg-gold px-4 py-4"
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color="#1B1814" />
              ) : (
                <Text className="text-surface-dark text-base font-semibold">Join Hawk circle →</Text>
              )}
            </Pressable>

            <Text className="text-text-muted mt-4 text-center text-xs">
              By continuing you agree to our Service Terms and acknowledge our Privacy policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-text-muted text-xs uppercase tracking-widest">{label}</Text>
      <View className="mt-2 rounded-lg border border-border bg-surface px-4 py-3">{children}</View>
    </View>
  );
}
