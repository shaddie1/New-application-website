import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { ProfileOverview } from '@onyxhawk/types';

import { useAuthStore } from '../../../src/auth/store';
import { api, ApiError } from '../../../src/api/client';

// Mockup 13 — profile + account settings hub.
export default function ProfileScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [profile, setProfile] = useState<ProfileOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getProfile();
      setProfile(res.profile);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load profile (${err.status}).` : 'Could not load profile.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of OnyxHawk on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          if (session) {
            try { await api.logout(session.refreshToken); } catch { /* ignore */ }
          }
          await signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Profile</Text>
        <Pressable onPress={() => router.push('/(app)/profile/edit')} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-base">✎</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!profile && !error && (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {profile && (
          <>
            <View className="mx-5 mt-4 rounded-2xl bg-surface-dark p-5">
              <View className="flex-row items-center">
                <Avatar url={profile.user.avatarUrl ?? null} name={profile.user.fullName} />
                <View className="flex-1 ml-4">
                  <Text className="text-text-on-dark text-2xl" style={{ fontFamily: 'serif' }}>
                    {profile.user.fullName}
                  </Text>
                  <Text className="text-text-on-dark-muted text-sm mt-0.5">{profile.user.phone}</Text>
                </View>
                <View className="rounded-pill bg-gold/20 px-3 py-1">
                  <Text className="text-gold text-xs uppercase tracking-widest">{profile.tier}</Text>
                </View>
              </View>

              <View className="flex-row mt-5 justify-between">
                <Stat label="Points" value={profile.pointsBalance.toLocaleString()} />
                <Stat label="Bookings" value={String(profile.bookingsCount)} />
                <Stat label="Member" value={memberFor(profile.memberSince)} />
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/(app)/loyalty')}
              className="mx-5 mt-4 rounded-xl bg-surface border border-gold px-4 py-3 flex-row items-center"
            >
              <View className="h-9 w-9 rounded-full bg-gold items-center justify-center">
                <Text className="text-surface-dark">★</Text>
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-text-muted text-[10px] uppercase tracking-widest">
                  Hawk Points · {profile.tier}
                </Text>
                <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>
                  {profile.pointsBalance.toLocaleString()}{' '}
                  <Text className="text-text-muted text-sm">= KSh {profile.pointsBalance.toLocaleString()} off</Text>
                </Text>
              </View>
              <Text className="text-gold-deep text-xl">›</Text>
            </Pressable>

            <View className="mt-8 px-5">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Account</Text>
              <Text className="text-text text-3xl mt-1" style={{ fontFamily: 'serif' }}>
                Settings
              </Text>
            </View>

            <View className="mx-5 mt-3">
              <SettingRow
                icon="◎"
                label="Saved addresses"
                onPress={() => router.push('/(app)/profile/addresses')}
              />
              <SettingRow
                icon="▤"
                label="Payment methods"
                trailing="M-Pesa"
                onPress={() => Alert.alert('Payment methods', 'M-Pesa is your default. Card support is coming soon.')}
              />
              <SettingRow
                icon="◔"
                label="Notifications"
                onPress={() => router.push('/(app)/profile/notifications')}
              />
              <SettingRow
                icon="❝"
                label="Quote requests"
                onPress={() => router.push('/(app)/quotes')}
              />
            </View>

            <Pressable onPress={handleSignOut} className="mx-5 mt-8 items-center rounded-lg bg-surface border border-border py-3">
              <Text className="text-danger text-base">Sign out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: 28 }} />;
  }
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View className="h-14 w-14 rounded-full bg-gold items-center justify-center">
      <Text className="text-surface-dark text-lg" style={{ fontFamily: 'serif' }}>{initials}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-on-dark-muted text-[10px] uppercase tracking-widest">{label}</Text>
      <Text className="text-text-on-dark text-lg mt-1" style={{ fontFamily: 'serif' }}>{value}</Text>
    </View>
  );
}

function SettingRow({ icon, label, trailing, onPress }: { icon: string; label: string; trailing?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-xl bg-surface border border-border px-4 py-4 mt-3 flex-row items-center">
      <Text className="text-gold-deep text-lg w-7">{icon}</Text>
      <Text className="text-text text-base flex-1">{label}</Text>
      {trailing && <Text className="text-text-muted text-sm mr-2">{trailing}</Text>}
      <Text className="text-text-muted text-xl">›</Text>
    </Pressable>
  );
}

function memberFor(iso: string): string {
  const created = new Date(iso).getTime();
  const months = Math.floor((Date.now() - created) / (30 * 86_400_000));
  if (months < 1) return 'New';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  return `${years} yr${years > 1 ? 's' : ''}`;
}
