import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { NotificationDto } from '@onyxhawk/types';

import { api, ApiError } from '../../src/api/client';

// In-app notification feed (bell icon on Home).
export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listNotifications();
      setItems(res.notifications);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load notifications (${err.status}).` : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Mark everything read once the feed has been opened.
  useEffect(() => {
    if (items && items.some((n) => !n.readAt)) {
      void api.markNotificationsRead().catch(() => {});
    }
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        <View className="px-5 pt-4">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            What's{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              new.
            </Text>
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!items && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {items && items.length === 0 && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border px-5 py-8 items-center">
            <Text className="text-text-muted text-sm text-center">No notifications yet.</Text>
          </View>
        )}

        <View className="px-5 mt-3">
          {(items ?? []).map((n) => (
            <Pressable
              key={n.id}
              onPress={() => openTarget(n, router)}
              className="mt-3 rounded-xl border px-4 py-3"
              style={{
                backgroundColor: n.readAt ? '#FFFFFF' : '#FDF8EC',
                borderColor: n.readAt ? '#E2DCC9' : '#E6CFA0',
              }}
            >
              <View className="flex-row items-center">
                {!n.readAt && <View className="h-2 w-2 rounded-full bg-gold mr-2" />}
                <Text className="text-text text-base flex-1" style={{ fontFamily: 'serif' }}>{n.title}</Text>
                <Text className="text-text-muted text-xs">{timeAgo(n.createdAt)}</Text>
              </View>
              <Text className="text-text-muted text-sm mt-1">{n.body}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function openTarget(n: NotificationDto, router: ReturnType<typeof useRouter>): void {
  const bookingId = typeof n.data?.bookingId === 'string' ? n.data.bookingId : null;
  if (bookingId) {
    router.push({ pathname: '/(app)/bookings/[id]', params: { id: bookingId } });
    return;
  }
  const quoteRequestId = typeof n.data?.quoteRequestId === 'string' ? n.data.quoteRequestId : null;
  if (quoteRequestId) router.push('/(app)/quotes');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', month: 'short', day: '2-digit' });
}
