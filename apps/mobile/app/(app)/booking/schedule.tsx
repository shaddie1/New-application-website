import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { AddressDto, AvailabilityResult, TimeSlot } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';
import { useBookingStore } from '../../../src/booking/store';

// Mockup 06 — pick a slot and confirm address.
export default function ScheduleScreen() {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);
  const setSchedule = useBookingStore((s) => s.setSchedule);

  const [addresses, setAddresses] = useState<AddressDto[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(draft.addressId);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  const [days] = useState(() => buildSevenDays());
  const firstDay = days[0]!;
  const [selectedDate, setSelectedDate] = useState<string>(firstDay.iso);
  const [availability, setAvailability] = useState<AvailabilityResult | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState(draft.notesForCrew ?? '');
  const [error, setError] = useState<string | null>(null);

  // Hop back to start if we lost the upstream selections.
  useEffect(() => {
    if (!draft.serviceLineCode || !draft.cleanTypeCode) {
      router.replace('/(app)/booking');
    }
  }, [draft.serviceLineCode, draft.cleanTypeCode]);

  // Load addresses (and default-select the first / default one).
  useEffect(() => {
    let active = true;
    api
      .listAddresses()
      .then((res) => {
        if (!active) return;
        setAddresses(res.addresses);
        if (!selectedAddressId) {
          const fallback = res.addresses.find((a) => a.isDefault) ?? res.addresses[0];
          if (fallback) setSelectedAddressId(fallback.id);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? `Could not load addresses (${err.status}).` : 'Could not load addresses.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-fetch availability whenever the date changes.
  useEffect(() => {
    let active = true;
    setAvailability(null);
    setSelectedSlot(null);
    api
      .getAvailability(selectedDate)
      .then((res) => {
        if (active) setAvailability(res);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? `Could not load times (${err.status}).` : 'Could not load times.');
      });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  const selectedAddress = useMemo(
    () => addresses?.find((a) => a.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );

  const canContinue = !!selectedSlot && !!selectedAddressId;

  const handleContinue = () => {
    if (!selectedSlot || !selectedAddressId) return;
    setSchedule({ addressId: selectedAddressId, scheduledAt: selectedSlot, notesForCrew: notes.trim() || null });
    router.push('/(app)/booking/confirm');
  };

  if (!draft.serviceLineCode || !draft.cleanTypeCode) return null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <StepDots step={2} />
        <Text className="text-text-muted text-sm">Step 2 / 3</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View className="px-5 pt-6">
          <Text className="text-gold-deep text-xs uppercase tracking-widest">
            {formatHeaderMonth(firstDay.date)}
          </Text>
          <Text className="text-text text-4xl mt-2" style={{ fontFamily: 'serif' }}>
            Pick your{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              slot.
            </Text>
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-4 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} className="mt-6">
          {days.map((d) => {
            const selected = d.iso === selectedDate;
            return (
              <Pressable
                key={d.iso}
                onPress={() => setSelectedDate(d.iso)}
                className="rounded-xl mr-2 border items-center justify-center"
                style={{
                  width: 56,
                  paddingVertical: 10,
                  backgroundColor: selected ? '#1B1814' : '#FFFFFF',
                  borderColor: selected ? '#1B1814' : '#E2DCC9',
                }}
              >
                <Text className="text-[10px] uppercase tracking-widest" style={{ color: selected ? '#B6AC9A' : '#5C544A' }}>
                  {d.weekdayShort}
                </Text>
                <Text className="text-lg mt-0.5" style={{ fontFamily: 'serif', color: selected ? '#F5F1E6' : '#1B1814' }}>
                  {d.dayNum}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="px-5 mt-8">
          <Text className="text-text-muted text-xs uppercase tracking-widest">
            Available times · {labelForSelectedDate(selectedDate)}
          </Text>

          {!availability && !error && (
            <View className="mt-4 items-center">
              <ActivityIndicator color="#C9A55C" />
            </View>
          )}

          {availability && (
            <View className="mt-3 flex-row flex-wrap">
              {availability.slots.map((slot) => (
                <SlotChip
                  key={slot.startsAt}
                  slot={slot}
                  selected={selectedSlot === slot.startsAt}
                  onPress={() => slot.available && setSelectedSlot(slot.startsAt)}
                />
              ))}
            </View>
          )}
        </View>

        <View className="px-5 mt-8">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Service address</Text>
        </View>

        {selectedAddress && (
          <View className="mx-5 mt-3 rounded-xl bg-surface border border-border overflow-hidden">
            <View className="h-32 bg-bg-muted items-center justify-center">
              <Text className="text-gold-deep text-2xl">●</Text>
            </View>
            <View className="px-4 py-3">
              <Text className="text-text text-base font-medium">{selectedAddress.line1}</Text>
              <Text className="text-text-muted text-sm mt-0.5">
                {[selectedAddress.area, selectedAddress.city].filter(Boolean).join(', ')} · Saved as{' '}
                {selectedAddress.label}
              </Text>

              <View className="flex-row mt-3">
                <Pressable
                  onPress={() => setShowAddressPicker((v) => !v)}
                  className="rounded-md border border-border px-3 py-1.5 mr-2"
                >
                  <Text className="text-text text-sm">Change address</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {showAddressPicker && addresses && (
          <View className="mx-5 mt-3 rounded-xl bg-surface border border-border">
            {addresses.map((a, idx) => (
              <View key={a.id}>
                <Pressable
                  onPress={() => {
                    setSelectedAddressId(a.id);
                    setShowAddressPicker(false);
                  }}
                  className="px-4 py-3"
                >
                  <Text className="text-text text-base">{a.label}</Text>
                  <Text className="text-text-muted text-sm mt-0.5">
                    {a.line1} · {a.area ?? a.city}
                  </Text>
                </Pressable>
                {idx < addresses.length - 1 && <View className="h-px bg-border mx-4" />}
              </View>
            ))}
          </View>
        )}

        <View className="px-5 mt-6">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Note for crew (optional)</Text>
          <View className="mt-2 rounded-lg bg-surface border border-border px-4 py-3">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Gate code, lift floor, pet at home…"
              placeholderTextColor="#A09886"
              multiline
              className="text-text text-base"
              style={{ minHeight: 48 }}
            />
          </View>
        </View>
      </ScrollView>

      <View className="absolute left-5 right-5 bottom-8">
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          className="items-center rounded-lg bg-gold px-4 py-4"
          style={{ opacity: canContinue ? 1 : 0.5 }}
        >
          <Text className="text-surface-dark text-base font-semibold">Review & confirm</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SlotChip({ slot, selected, onPress }: { slot: TimeSlot; selected: boolean; onPress: () => void }) {
  const label = formatTimeNairobi(slot.startsAt);
  const disabled = !slot.available;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-pill mr-2 mb-2 px-4 py-2 border"
      style={{
        backgroundColor: selected ? '#1B1814' : '#FFFFFF',
        borderColor: selected ? '#1B1814' : '#E2DCC9',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        className="text-sm"
        style={{
          color: selected ? '#F5F1E6' : '#1B1814',
          textDecorationLine: disabled ? 'line-through' : 'none',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className="h-1.5 rounded-full"
          style={{ width: i === step ? 24 : 12, backgroundColor: i === step ? '#C9A55C' : '#E2DCC9' }}
        />
      ))}
    </View>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────

interface DayCell {
  iso: string;          // YYYY-MM-DD (Nairobi calendar)
  date: Date;           // local Date object (UTC midnight of that day)
  weekdayShort: string; // "Mon"
  dayNum: string;       // "24"
}

function buildSevenDays(): DayCell[] {
  const out: DayCell[] = [];
  const now = new Date();
  // Use Nairobi calendar — the same logic the API uses.
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const iso = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
    out.push({
      iso,
      date: d,
      weekdayShort: d.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short' }).toUpperCase(),
      dayNum: d.toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', day: '2-digit' }),
    });
  }
  return out;
}

function formatHeaderMonth(d: Date): string {
  return d
    .toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', month: 'long', year: 'numeric' })
    .toUpperCase();
}

function labelForSelectedDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  // Construct at noon UTC so that toLocaleDateString in Nairobi reads the right day.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt
    .toLocaleDateString('en-US', { timeZone: 'Africa/Nairobi', weekday: 'short', day: '2-digit' })
    .toUpperCase();
}

function formatTimeNairobi(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });
}
