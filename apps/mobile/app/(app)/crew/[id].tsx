import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CrewJobDto, CrewTransitionTo } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';
import { CrewPhotoSection, defaultRoomsForScope } from '../../../src/photos/CrewPhotoSection';

// Crew job detail. The big buttons drive the
// CONFIRMED → EN_ROUTE → IN_PROGRESS → COMPLETED transitions.
export default function CrewJobScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : null;

  const [job, setJob] = useState<CrewJobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creditBanner, setCreditBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getCrewJob(id);
      setJob(res.job);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load job (${err.status}).` : 'Could not load job.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (!id) return null;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleTransition = async (to: CrewTransitionTo) => {
    if (!job) return;
    if (to === 'COMPLETED') {
      Alert.alert(
        'Complete this job?',
        'This will credit the customer\'s Hawk Points and close the booking. Make sure all rooms are documented.',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark complete', style: 'default', onPress: () => void doTransition(to) },
        ],
      );
      return;
    }
    void doTransition(to);
  };

  const doTransition = async (to: CrewTransitionTo) => {
    if (!job) return;
    setBusy(true);
    try {
      const res = await api.transitionCrewJob(job.id, to);
      if (to === 'COMPLETED' && typeof res.pointsCredited === 'number' && res.pointsCredited > 0) {
        setCreditBanner(`Credited ${res.pointsCredited} Hawk Points to ${job.customerName.split(' ')[0]}.`);
      }
      await load();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not update job state.';
      Alert.alert('Job', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">
          {job?.reference ?? 'Job'}
        </Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 220 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A55C" />}
      >
        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!job && !error && (
          <View className="mt-16 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {job && (
          <>
            <View className="px-5 pt-4">
              <View
                className="self-start rounded-pill px-3 py-1"
                style={{ backgroundColor: serviceLineColor(job.serviceLineCode) + '20' }}
              >
                <Text className="text-xs uppercase tracking-widest" style={{ color: serviceLineColor(job.serviceLineCode) }}>
                  ● {serviceLineLabel(job.serviceLineCode)} · {job.crewRole}
                </Text>
              </View>
              <Text className="text-text text-4xl mt-3" style={{ fontFamily: 'serif' }}>
                {cleanTypeLabel(job.cleanTypeCode)}
              </Text>
              <Text className="text-text-muted text-base mt-1">
                {job.scope.bedrooms} bed · {job.scope.bathrooms} bath · {job.scope.livingRooms} living
                {job.scope.squareMeters ? ` · ~${job.scope.squareMeters} m²` : ''}
              </Text>
            </View>

            {creditBanner && (
              <View className="mx-5 mt-4 rounded-xl bg-success/15 px-4 py-3 flex-row items-center">
                <Text className="text-success text-lg mr-2">✓</Text>
                <Text className="text-text text-sm flex-1">{creditBanner}</Text>
              </View>
            )}

            <View className="mx-5 mt-4 rounded-xl bg-surface border border-border p-4">
              <Row label="When" value={formatNairobi(job.scheduledAt)} />
              <Divider />
              <Row label="Customer" value={`${job.customerName}`} />
              <Pressable onPress={() => Linking.openURL(`tel:${job.customerPhone}`)} className="py-1">
                <Text className="text-gold-deep text-sm">{job.customerPhone}  ·  tap to call</Text>
              </Pressable>
              <Divider />
              <Row label="Address" value={`${job.address.line1}${job.address.area ? ` · ${job.address.area}` : ''}`} />
              {job.address.accessNotes && (
                <>
                  <Divider />
                  <Row label="Access" value={job.address.accessNotes} />
                </>
              )}
              {job.notesForCrew && (
                <>
                  <Divider />
                  <Row label="Notes" value={job.notesForCrew} />
                </>
              )}
              <Divider />
              <Row label="Status" valueComponent={<StatusPill status={job.status} />} />
            </View>

            <View className="mx-5 mt-3 rounded-xl bg-surface-dark px-4 py-4">
              <Text className="text-text-on-dark-muted text-xs uppercase tracking-widest">Est. duration</Text>
              <Text className="text-text-on-dark text-2xl mt-1" style={{ fontFamily: 'serif' }}>
                {formatDuration(job.estimatedDurationMinutes)}
              </Text>
              <Text className="text-gold text-sm mt-1">
                +{job.pointsToEarn} pts will credit on complete
              </Text>
            </View>

            {job.status !== 'PENDING_PAYMENT' && job.status !== 'CANCELLED' && (
              <View className="mx-5 mt-3">
                <CrewPhotoSection
                  bookingId={job.id}
                  defaultRooms={defaultRoomsForScope(job.scope)}
                  editable={job.crewRole === 'LEAD' && (job.status === 'EN_ROUTE' || job.status === 'IN_PROGRESS')}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {job && job.crewRole === 'LEAD' && <ActionBar status={job.status} busy={busy} onAction={handleTransition} />}
      {job && job.crewRole !== 'LEAD' && (
        <View className="absolute left-5 right-5 bottom-8 rounded-lg bg-surface border border-border py-3 items-center">
          <Text className="text-text-muted text-sm">Only the LEAD can advance this job.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionBar({
  status,
  busy,
  onAction,
}: {
  status: string;
  busy: boolean;
  onAction: (to: CrewTransitionTo) => void;
}) {
  let to: CrewTransitionTo | null = null;
  let label = '';
  switch (status) {
    case 'CONFIRMED':   to = 'EN_ROUTE';    label = "I'm en route"; break;
    case 'EN_ROUTE':    to = 'IN_PROGRESS'; label = 'Arrived — start clean'; break;
    case 'IN_PROGRESS': to = 'COMPLETED';   label = 'Mark complete'; break;
  }

  if (!to) {
    return (
      <View className="absolute left-5 right-5 bottom-8 rounded-lg bg-surface border border-border py-3 items-center">
        <Text className="text-text-muted text-sm">
          {status === 'COMPLETED' ? 'This job is done.' : status === 'PENDING_PAYMENT' ? 'Waiting on payment to confirm.' : `No crew action available (${status.toLowerCase()}).`}
        </Text>
      </View>
    );
  }

  return (
    <View className="absolute left-5 right-5 bottom-8">
      <Pressable
        onPress={() => onAction(to!)}
        disabled={busy}
        className="items-center rounded-lg bg-gold py-4"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">{label}</Text>}
      </Pressable>
    </View>
  );
}

function Row({ label, value, valueComponent }: { label: string; value?: string; valueComponent?: React.ReactNode }) {
  return (
    <View className="flex-row justify-between py-2">
      <Text className="text-text-muted text-sm">{label}</Text>
      {valueComponent ?? <Text className="text-text text-sm text-right flex-shrink ml-3">{value}</Text>}
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-border" />;
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
    case 'deep': return 'Deep clean';
    case 'move_out': return 'Move-out clean';
    case 'recurring': return 'Recurring clean';
    default: return 'Standard clean';
  }
}

function formatNairobi(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).replace(',', '') + ' · ' +
    d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
