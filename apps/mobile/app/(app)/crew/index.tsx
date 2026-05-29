import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { CrewJobDto } from '@onyxhawk/types';

import { useAuthStore } from '../../../src/auth/store';
import { api, ApiError } from '../../../src/api/client';

// Crew home — list of jobs assigned to the signed-in crew user.
export default function CrewHomeScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [scope, setScope] = useState<'today' | 'upcoming' | 'past'>('today');
  const [jobs, setJobs] = useState<CrewJobDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showClaim, setShowClaim] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listCrewJobs(scope);
      setJobs(res.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load jobs (${err.status}).` : 'Could not load jobs.');
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!session) return null;
  const firstName = session.user.fullName.split(' ')[0];

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    try { await api.logout(session.refreshToken); } catch { /* ignore */ }
    await signOut();
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        <View className="px-5 pt-2">
          <Text className="text-text-muted text-xs uppercase tracking-widest">
            Crew · {session.user.role === 'CREW_LEAD' ? 'Lead' : 'Member'}
          </Text>
          <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
            {greetingForNow()},
          </Text>
          <Text className="text-gold-deep text-4xl italic" style={{ fontFamily: 'serif' }}>
            {firstName}.
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            {scope === 'today' ? "Here's your run for today." : scope === 'upcoming' ? 'Upcoming assignments.' : 'Past jobs.'}
          </Text>
        </View>

        <View className="mx-5 mt-6 flex-row rounded-xl bg-surface border border-border p-1">
          <Tab label="Today" active={scope === 'today'} onPress={() => setScope('today')} />
          <Tab label="Upcoming" active={scope === 'upcoming'} onPress={() => setScope('upcoming')} />
          <Tab label="Past" active={scope === 'past'} onPress={() => setScope('past')} />
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!jobs && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {jobs && jobs.length === 0 && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border px-5 py-8 items-center">
            <Text className="text-text-muted text-sm text-center">
              {scope === 'today'
                ? 'No jobs scheduled today.'
                : scope === 'upcoming'
                ? 'No upcoming assignments — you can claim a confirmed booking below.'
                : 'No past jobs yet.'}
            </Text>
          </View>
        )}

        <View className="mt-3 px-5">
          {(jobs ?? []).map((j) => (
            <JobCard
              key={j.id}
              job={j}
              onPress={() => router.push({ pathname: '/(app)/crew/[id]', params: { id: j.id } })}
            />
          ))}
        </View>

        <View className="mx-5 mt-8">
          <Pressable
            onPress={() => setShowClaim(true)}
            className="rounded-xl bg-surface border border-border px-5 py-4 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-text text-base font-medium">Claim a booking</Text>
              <Text className="text-text-muted text-xs mt-0.5">Paste a booking reference to add yourself as LEAD</Text>
            </View>
            <Text className="text-text text-xl">＋</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleSignOut} className="mx-5 mt-12 self-start">
          <Text className="text-text-muted underline">Sign out</Text>
        </Pressable>
      </ScrollView>

      <ClaimModal visible={showClaim} onClose={() => setShowClaim(false)} onClaimed={() => { setShowClaim(false); void load(); }} />
    </SafeAreaView>
  );
}

function ClaimModal({ visible, onClose, onClaimed }: { visible: boolean; onClose: () => void; onClaimed: () => void }) {
  const [bookingId, setBookingId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleClaim = async () => {
    if (!bookingId.trim()) return;
    setSubmitting(true);
    try {
      await api.claimCrewJob(bookingId.trim(), 'LEAD');
      Alert.alert('Claimed', 'You are now LEAD on this booking.');
      setBookingId('');
      onClaimed();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not claim that booking.';
      Alert.alert('Claim', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-surface-dark/60 justify-end">
        <View className="bg-bg rounded-t-2xl px-5 pt-6 pb-10">
          <View className="h-1.5 w-12 self-center rounded-full bg-border" />
          <Text className="text-text text-2xl mt-4" style={{ fontFamily: 'serif' }}>
            Claim a booking
          </Text>
          <Text className="text-text-muted text-sm mt-1">
            Paste the booking ID (not the OH- reference). Once admin tooling lands this gets replaced by proper assignment.
          </Text>

          <View className="mt-4 rounded-lg bg-surface border border-border px-4 py-3">
            <TextInput
              value={bookingId}
              onChangeText={setBookingId}
              placeholder="clxxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor="#A09886"
              autoCapitalize="none"
              autoCorrect={false}
              className="text-text text-base"
            />
          </View>

          <View className="mt-4 flex-row gap-3">
            <Pressable onPress={onClose} className="flex-1 items-center rounded-lg bg-surface border border-border py-3">
              <Text className="text-text text-base">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleClaim}
              disabled={submitting || !bookingId.trim()}
              className="flex-1 items-center rounded-lg bg-gold py-3"
              style={{ opacity: submitting || !bookingId.trim() ? 0.6 : 1 }}
            >
              {submitting ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Claim as LEAD</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function JobCard({ job, onPress }: { job: CrewJobDto; onPress: () => void }) {
  const date = new Date(job.scheduledAt);
  const time = date.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
  const dotColor = serviceLineColor(job.serviceLineCode);

  return (
    <Pressable onPress={onPress} className="mt-3 rounded-xl bg-surface border border-border p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-xs uppercase tracking-widest ml-1.5" style={{ color: dotColor }}>
            {serviceLineLabel(job.serviceLineCode)}
          </Text>
        </View>
        <Text className="text-text-muted text-xs">{job.reference} · {job.crewRole}</Text>
      </View>

      <Text className="text-text text-lg mt-2" style={{ fontFamily: 'serif' }}>
        {cleanTypeLabel(job.cleanTypeCode)} · {job.scope.bedrooms} bed / {job.scope.bathrooms} bath
      </Text>

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-text-muted text-sm">{job.address.line1}{job.address.area ? ` · ${job.address.area}` : ''}</Text>
        <Text className="text-text text-sm">{time}</Text>
      </View>

      <View className="flex-row items-center justify-between mt-3">
        <Text className="text-text-muted text-xs">For {job.customerName.split(' ')[0]} · {job.customerPhone}</Text>
        <StatusPill status={job.status} />
      </View>
    </Pressable>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center rounded-lg py-2"
      style={{ backgroundColor: active ? '#1B1814' : 'transparent' }}
    >
      <Text className="text-sm" style={{ color: active ? '#F5F1E6' : '#5C544A' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusPill({ status }: { status: string }) {
  const { label, color, bg } = statusBadge(status);
  return (
    <View className="rounded-pill px-2 py-0.5" style={{ backgroundColor: bg }}>
      <Text className="text-xs" style={{ color }}>{label}</Text>
    </View>
  );
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'PENDING_PAYMENT': return { label: 'Awaiting payment', color: '#A78445', bg: '#E6CFA033' };
    case 'CONFIRMED':       return { label: 'Confirmed', color: '#A78445', bg: '#E6CFA033' };
    case 'EN_ROUTE':        return { label: 'En route', color: '#3A5E7A', bg: '#3A5E7A22' };
    case 'IN_PROGRESS':     return { label: 'In progress', color: '#3A5E7A', bg: '#3A5E7A22' };
    case 'COMPLETED':       return { label: 'Completed', color: '#4F7B5C', bg: '#4F7B5C22' };
    case 'CANCELLED':       return { label: 'Cancelled', color: '#5C544A', bg: '#E2DCC9' };
    default:                return { label: status, color: '#5C544A', bg: '#E2DCC9' };
  }
}

function serviceLineColor(code: string): string {
  switch (code) {
    case 'residential': return '#4F7B5C';
    case 'office': return '#3A5E7A';
    case 'hospital': return '#A8556B';
    case 'post_build': return '#C97E3B';
    case 'fumigation': return '#6B4E8C';
    default: return '#C9A55C';
  }
}

function serviceLineLabel(code: string): string {
  switch (code) {
    case 'residential': return 'Residential';
    case 'office': return 'Office';
    case 'hospital': return 'Hospital';
    case 'post_build': return 'Post-build';
    case 'fumigation': return 'Fumigation';
    default: return code;
  }
}

function cleanTypeLabel(code: string): string {
  switch (code) {
    case 'deep': return 'Deep';
    case 'move_out': return 'Move-out';
    case 'recurring': return 'Recurring';
    default: return 'Standard';
  }
}

function greetingForNow(): string {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
