import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { ServiceLineDto } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';
import { useBookingStore } from '../../../src/booking/store';

// Mockup 04 — service catalog.
export default function ServiceCatalogScreen() {
  const router = useRouter();
  const setServiceLine = useBookingStore((s) => s.setServiceLine);

  const [lines, setLines] = useState<ServiceLineDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getServiceLines()
      .then((res) => {
        if (active) setLines(res.serviceLines);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg =
          err instanceof ApiError ? `Could not load services (${err.status}).` : 'Could not load services.';
        setError(msg);
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePick = (line: ServiceLineDto) => {
    if (line.quoteOnly) {
      // Route to quote-request flow once it exists. For now, no-op visually.
      return;
    }
    setServiceLine({
      serviceLineCode: line.code,
      serviceLineName: line.name,
      serviceLineColorHex: line.colorHex,
    });
    router.push('/(app)/booking/scope');
  };

  const filtered = (lines ?? []).filter((l) =>
    l.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Our services</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-6">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Choose your{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              scope.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Five service lines. One crew.
          </Text>
        </View>

        <View className="mx-5 mt-6 rounded-lg bg-surface px-4 py-3 border border-border">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder='Search "deep clean", "fumigation"…'
            placeholderTextColor="#A09886"
            className="text-text text-base"
          />
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!lines && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        <View className="mt-4 px-5">
          {filtered.map((line) => (
            <ServiceLineCard key={line.id} line={line} onPress={() => handlePick(line)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ServiceLineCard({ line, onPress }: { line: ServiceLineDto; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 flex-row items-center rounded-xl bg-surface p-4 border border-border"
    >
      <View
        className="h-16 w-16 items-center justify-center rounded-lg"
        style={{ backgroundColor: (line.colorHex ?? '#C9A55C') + '20' }}
      >
        <View
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: line.colorHex ?? '#C9A55C' }}
        />
      </View>

      <View className="flex-1 ml-4">
        <View className="flex-row items-center">
          <Text className="text-text text-lg font-medium flex-1" style={{ fontFamily: 'serif' }}>
            {line.name}
          </Text>
          {line.badge !== 'NONE' && (
            <View className="rounded-pill bg-gold-soft px-2 py-0.5">
              <Text className="text-gold-deep text-[10px] uppercase tracking-widest">
                {line.badge === 'MOST_BOOKED' ? 'Most booked' : line.badge === 'CERTIFIED' ? 'Certified' : 'New'}
              </Text>
            </View>
          )}
        </View>
        {line.tagline && (
          <Text className="text-text-muted text-sm mt-1" numberOfLines={2}>
            {line.tagline}
          </Text>
        )}
        <Text className="text-gold-deep text-xs uppercase tracking-widest mt-2">
          {line.quoteOnly
            ? 'FROM On quote'
            : line.fromPriceCents
            ? `FROM KSh ${(line.fromPriceCents / 100).toLocaleString()}`
            : ''}
        </Text>
      </View>

      <Text className="text-gold-deep text-xl ml-2">›</Text>
    </Pressable>
  );
}
