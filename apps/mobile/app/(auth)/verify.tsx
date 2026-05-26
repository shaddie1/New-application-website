import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, ApiError } from '../../src/api/client';
import { useAuthStore } from '../../src/auth/store';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone, devOtp } = useLocalSearchParams<{ phone: string; devOtp?: string }>();
  const setSession = useAuthStore((s) => s.setSession);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dev convenience: auto-fill the OTP when the API surfaces it.
  useEffect(() => {
    if (devOtp && devOtp.length === 6) setCode(devOtp);
  }, [devOtp]);

  const handleVerify = async () => {
    if (!phone || code.length !== 6) return;
    setSubmitting(true);
    try {
      const res = await api.verifyOtp(phone, code);
      if (res.kind === 'AUTHENTICATED') {
        await setSession(res.session);
        // Root layout will redirect to (app); no explicit push needed.
        return;
      }
      // NEEDS_REGISTRATION → finish account on screen 02.
      router.replace({ pathname: '/(auth)/register', params: { registrationToken: res.registrationToken, phone: res.phone } });
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Verification failed.';
      Alert.alert('Verify', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!phone) return;
    try {
      const res = await api.requestOtp(phone);
      if (res.devOtp) setCode(res.devOtp);
      Alert.alert('Code sent', `A new code was sent to ${phone}.`);
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not resend code.';
      Alert.alert('Resend', msg);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 px-6 pt-12">
          <Pressable onPress={() => router.back()} className="self-start">
            <Text className="text-text-muted text-2xl">←</Text>
          </Pressable>

          <View className="mt-12">
            <Text className="text-text-muted text-xs uppercase tracking-widest">Verify code</Text>
            <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
              Check your{' '}
              <Text className="text-gold-deep italic">messages.</Text>
            </Text>
            <Text className="text-text-muted mt-3 text-base">
              We sent a 6-digit code to {phone}.
            </Text>
          </View>

          <View className="mt-12">
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • • • •"
              keyboardType="number-pad"
              autoFocus
              className="rounded-lg border border-border bg-surface px-4 py-4 text-center text-3xl text-text tracking-widest"
              placeholderTextColor="#A09886"
              maxLength={6}
            />

            <Pressable
              onPress={handleVerify}
              disabled={submitting || code.length !== 6}
              className="mt-4 items-center rounded-lg bg-gold px-4 py-4"
              style={{ opacity: submitting || code.length !== 6 ? 0.6 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color="#1B1814" />
              ) : (
                <Text className="text-surface-dark text-base font-semibold">Verify</Text>
              )}
            </Pressable>

            <Pressable onPress={handleResend} className="mt-6 self-center">
              <Text className="text-gold-deep underline">Resend code</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
