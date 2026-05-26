import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/auth/store';
import { useBookingStore } from '../../src/booking/store';
import { api } from '../../src/api/client';

// Home screen — visual sketch of mockup 03.
// The booking flow / data plumbing is the next pass; this is just enough to
// confirm the design tokens and the auth gate work end-to-end.
export default function HomeScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const resetBooking = useBookingStore((s) => s.reset);

  if (!session) return null;

  const startBooking = () => {
    resetBooking();
    router.push('/(app)/booking');
  };

  const firstName = session.user.fullName.split(' ')[0];

  const handleSignOut = async () => {
    try {
      await api.logout(session.refreshToken);
    } catch {
      // Continue with local sign-out even if the server call fails.
    }
    await signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-2">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Tuesday · 26 May</Text>
          <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
            Good morning,
          </Text>
          <Text className="text-gold-deep text-4xl italic" style={{ fontFamily: 'serif' }}>
            {firstName}.
          </Text>
        </View>

        <View className="mx-5 mt-8 rounded-xl bg-surface-dark p-5">
          <View className="self-start rounded-pill bg-service-residential/20 px-3 py-1">
            <Text className="text-service-residential text-xs uppercase tracking-widest">● Residential</Text>
          </View>
          <Text className="text-text-on-dark mt-3 text-2xl" style={{ fontFamily: 'serif' }}>
            Deep clean
          </Text>
          <Text className="text-gold italic text-lg" style={{ fontFamily: 'serif' }}>
            3-bedroom apartment
          </Text>

          <View className="mt-4 flex-row justify-between">
            <Column label="TODAY" value="2:30 PM" />
            <Column label="CREW" value="4 + lead" />
            <Column label="EST." value="3h 30m" />
          </View>

          <Pressable className="mt-4 self-end rounded-lg bg-gold px-4 py-2">
            <Text className="text-surface-dark font-semibold">Track →</Text>
          </Pressable>
        </View>

        <View className="mt-8 px-5">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Book a clean</Text>
          <Text className="text-text mt-1 text-3xl" style={{ fontFamily: 'serif' }}>
            What needs sweeping?
          </Text>
        </View>

        <Pressable
          onPress={startBooking}
          className="mx-5 mt-4 rounded-xl bg-gold px-5 py-4 flex-row items-center justify-between"
        >
          <View>
            <Text className="text-surface-dark text-base font-semibold">Start a new booking</Text>
            <Text className="text-surface-dark/70 text-xs mt-0.5">Pick a service · scope · slot</Text>
          </View>
          <Text className="text-surface-dark text-xl">→</Text>
        </Pressable>

        <Pressable onPress={handleSignOut} className="mx-5 mt-12 self-start">
          <Text className="text-text-muted underline">Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Column({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-on-dark-muted text-[10px] uppercase tracking-widest">{label}</Text>
      <Text className="text-text-on-dark mt-1 text-base font-medium">{value}</Text>
    </View>
  );
}
