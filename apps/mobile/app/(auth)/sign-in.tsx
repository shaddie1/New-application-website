import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api, ApiError } from '../../src/api/client';

const SLIDES = [
  {
    eyebrow: 'Welcome back',
    headline: 'Premium cleaning.',
    accent: 'Booked in minutes.',
    body: 'Homes, offices & hospitals — one trusted crew, scheduled around your day.',
  },
  {
    eyebrow: 'Trusted across Nairobi',
    headline: '500+ happy clients.',
    accent: '4.9 ★ rating.',
    body: 'Over 2,000 completed cleans and counting. Join a community that never settles for less.',
  },
  {
    eyebrow: 'Our promise to you',
    headline: 'Love it or it\'s free.',
    accent: 'Zero risk.',
    body: 'Not 100% satisfied? We come back and re-clean at absolutely no cost to you.',
  },
];

const BADGES = [
  { icon: '🛡️', label: 'Fully insured' },
  { icon: '🌿', label: 'Eco-friendly' },
  { icon: '⚡', label: 'Same-day available' },
];

export default function SignInScreen() {
  const router = useRouter();
  const [localPhone, setLocalPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Auto-advance carousel every 4 seconds
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setSlideIndex((prev) => (prev + 1) % SLIDES.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(id);
  }, [fadeAnim]);

  const goToSlide = (i: number) => {
    if (i === slideIndex) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setSlideIndex(i);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

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

  const slide = SLIDES[slideIndex]!;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Top marketing panel ──────────────────────────────────────── */}
          <View className="bg-surface-dark px-6 pt-12 pb-8">
            <Text className="text-text-on-dark-muted text-xs uppercase tracking-widest">
              OnyxHawk · Est. 2019
            </Text>

            {/* Rotating slide */}
            <Animated.View style={{ opacity: fadeAnim }} className="mt-8 min-h-[120px]">
              <Text className="text-gold text-xs uppercase tracking-widest mb-2">{slide.eyebrow}</Text>
              <Text className="text-text-on-dark text-4xl leading-tight" style={{ fontFamily: 'serif' }}>
                {slide.headline}
              </Text>
              <Text className="text-gold text-4xl italic leading-tight" style={{ fontFamily: 'serif' }}>
                {slide.accent}
              </Text>
              <Text className="text-text-on-dark-muted mt-3 text-sm leading-relaxed">
                {slide.body}
              </Text>
            </Animated.View>

            {/* Dot indicators */}
            <View className="flex-row gap-2 mt-6">
              {SLIDES.map((_, i) => (
                <Pressable key={i} onPress={() => goToSlide(i)} hitSlop={8}>
                  <View
                    style={{
                      width: i === slideIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i === slideIndex ? '#C9A55C' : '#5C544A',
                    }}
                  />
                </Pressable>
              ))}
            </View>

            {/* Trust badges */}
            <View className="flex-row gap-2 mt-6">
              {BADGES.map((b) => (
                <View
                  key={b.label}
                  className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
                  style={{ backgroundColor: 'rgba(201,165,92,0.15)', borderWidth: 1, borderColor: 'rgba(201,165,92,0.3)' }}
                >
                  <Text style={{ fontSize: 12 }}>{b.icon}</Text>
                  <Text className="text-gold text-xs">{b.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Sign-in form ──────────────────────────────────────────────── */}
          <View className="flex-1 px-6 pt-8 pb-6">
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

            {/* Bottom reassurance line */}
            <Text className="text-text-muted text-xs text-center mt-8 leading-relaxed">
              By continuing you agree to our Terms of Service.{'\n'}
              Your number is never shared or sold.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
