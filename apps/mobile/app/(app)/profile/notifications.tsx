import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { NotificationChannel, NotificationPreferenceDto } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';

const CHANNEL_META: Record<NotificationChannel, { title: string; subtitle: string }> = {
  PUSH: { title: 'Push notifications', subtitle: 'Booking confirmations, crew en route, points credited' },
  SMS: { title: 'SMS', subtitle: 'Text alerts for confirmations and reminders' },
  EMAIL: { title: 'Email', subtitle: 'Receipts and occasional offers' },
};

const ORDER: NotificationChannel[] = ['PUSH', 'SMS', 'EMAIL'];

export default function NotificationsScreen() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferenceDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<NotificationChannel | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getNotificationPrefs();
      setPrefs(res.preferences);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load preferences (${err.status}).` : 'Could not load preferences.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const enabledFor = (channel: NotificationChannel): boolean =>
    prefs?.find((p) => p.channel === channel)?.enabled ?? false;

  const toggle = async (channel: NotificationChannel, next: boolean) => {
    // Optimistic update.
    setPrefs((prev) => {
      const base = prev ?? [];
      const exists = base.some((p) => p.channel === channel);
      return exists
        ? base.map((p) => (p.channel === channel ? { ...p, enabled: next } : p))
        : [...base, { channel, enabled: next }];
    });
    setPending(channel);
    try {
      await api.updateNotificationPref({ channel, enabled: next });
    } catch {
      Alert.alert('Notifications', 'Could not update that setting.');
      await load(); // revert to server truth
    } finally {
      setPending(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Notifications</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-4">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Stay in the{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              loop.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Choose how we reach you.
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!prefs && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {prefs && (
          <View className="px-5 mt-4">
            {ORDER.map((channel) => (
              <View key={channel} className="rounded-xl bg-surface border border-border px-4 py-4 mt-3 flex-row items-center">
                <View className="flex-1 pr-3">
                  <Text className="text-text text-base">{CHANNEL_META[channel].title}</Text>
                  <Text className="text-text-muted text-xs mt-0.5">{CHANNEL_META[channel].subtitle}</Text>
                </View>
                {pending === channel ? (
                  <ActivityIndicator color="#C9A55C" />
                ) : (
                  <Switch
                    value={enabledFor(channel)}
                    onValueChange={(v) => toggle(channel, v)}
                    trackColor={{ true: '#C9A55C', false: '#E2DCC9' }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
