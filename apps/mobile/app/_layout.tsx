import '../global.css';
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { colors } from '@onyxhawk/ui-tokens';
import { useAuthStore } from '../src/auth/store';

export default function RootLayout() {
  const session = useAuthStore((s) => s.session);
  const hydrate = useAuthStore((s) => s.hydrate);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (session === undefined) return; // still hydrating
    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    if (!session && inAppGroup) {
      // Guest trying to reach a protected (app) route
      router.replace('/(auth)/sign-in');
    } else if (session && !inAppGroup) {
      // Authenticated user on landing or auth screens → go to main app
      router.replace('/(app)');
    }
  }, [session, segments, router]);

  // Until we know the auth state, render a blank cream surface so we don't
  // flash the wrong screen.
  if (session === undefined) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaProvider>
  );
}
