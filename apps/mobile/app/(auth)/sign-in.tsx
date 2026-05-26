import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api, ApiError } from '../../src/api/client';

// Mockup 01 — phone-OTP sign-in. "Continue with Apple" deferred (placeholder).
export default function SignInScreen() {
  const router = useRouter();
  const [localPhone, setLocalPhone] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const digits = localPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      Alert.alert('Phone number', 'Enter your 9-digit Safaricom number (e.g. 712 480 392).');
      return;
    }
    const phone = `+254${digits.replace(/^0/, '')}`;
    setSending(true);
    try {
      const res = await api.requestOtp(phone);
      router.push({ pathname: '/(auth)/verify', params: { phone, devOtp: res.devOtp ?? '' } });
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not send code. Check your connection.';
      Alert.alert('Sign in', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 px-6 pt-12">
          <Text className="text-text-muted text-xs uppercase tracking-widest">OnyxHawk · Est. 2019</Text>

          <View className="mt-16">
            <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
              Premium cleaning.
            </Text>
            <Text className="text-gold-deep text-4xl italic" style={{ fontFamily: 'serif' }}>
              Booked in minutes.
            </Text>
            <Text className="text-text-muted mt-3 text-base">
              Homes, offices, hospitals. One crew, scheduled around your day.
            </Text>
          </View>

          <View className="mt-12">
            <Text className="text-text-muted text-xs uppercase tracking-widest">Sign in with phone</Text>
            <View className="mt-2 flex-row items-center rounded-lg border border-border bg-surface px-4 py-3">
              <Text className="text-text-muted mr-3">KE +254</Text>
              <TextInput
                value={localPhone}
                onChangeText={setLocalPhone}
                placeholder="712 480 392"
                keyboardType="number-pad"
                autoComplete="tel"
                className="flex-1 text-text text-lg"
                placeholderTextColor="#A09886"
                maxLength={12}
              />
            </View>

            <Pressable
              onPress={handleSend}
              disabled={sending}
              className="mt-4 items-center rounded-lg bg-gold px-4 py-4"
              style={{ opacity: sending ? 0.6 : 1 }}
            >
              {sending ? (
                <ActivityIndicator color="#1B1814" />
              ) : (
                <Text className="text-surface-dark text-base font-semibold">Send verification code</Text>
              )}
            </Pressable>

            <Pressable disabled className="mt-3 items-center rounded-lg bg-surface-dark px-4 py-4 opacity-50">
              <Text className="text-text-on-dark text-base font-semibold"> Continue with Apple</Text>
            </Pressable>

            <View className="mt-6 flex-row items-center justify-center">
              <Text className="text-text-muted text-sm">New here? </Text>
              <Text className="text-gold-deep text-sm">Verify to continue →</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
