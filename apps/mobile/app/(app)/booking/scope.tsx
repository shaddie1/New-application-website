import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CleanTypeDto, AddOnDto, CleanTypeCode } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';
import { useBookingStore } from '../../../src/booking/store';

// Mockup 05 — define scope (clean type + rooms + add-ons).
export default function ScopeScreen() {
  const router = useRouter();
  const draft = useBookingStore((s) => s.draft);
  const setCleanType = useBookingStore((s) => s.setCleanType);
  const setScope = useBookingStore((s) => s.setScope);
  const toggleAddOn = useBookingStore((s) => s.toggleAddOn);

  const [cleanTypes, setCleanTypes] = useState<CleanTypeDto[] | null>(null);
  const [addOns, setAddOns] = useState<AddOnDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.serviceLineCode) {
      router.replace('/(app)/booking');
      return;
    }
    let active = true;
    api
      .getServiceLine(draft.serviceLineCode)
      .then((res) => {
        if (!active) return;
        setCleanTypes(res.serviceLine.cleanTypes);
        setAddOns(res.serviceLine.addOns);
        // Pre-pick the first active clean type if nothing chosen yet.
        if (!draft.cleanTypeCode && res.serviceLine.cleanTypes[0]) {
          const first = res.serviceLine.cleanTypes[0];
          setCleanType({ cleanTypeCode: first.code, cleanTypeName: first.name });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiError ? `Could not load options (${err.status}).` : 'Could not load options.');
      });
    return () => {
      active = false;
    };
  }, [draft.serviceLineCode]);

  const canContinue = useMemo(() => {
    return !!draft.cleanTypeCode && draft.bedrooms >= 0 && draft.bathrooms >= 0 && draft.livingRooms >= 0;
  }, [draft]);

  if (!draft.serviceLineCode) return null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <StepDots step={1} />
        <Text className="text-text-muted text-sm">Step 1 / 3</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-6">
          <View
            className="self-start rounded-pill px-3 py-1"
            style={{ backgroundColor: (draft.serviceLineColorHex ?? '#C9A55C') + '20' }}
          >
            <Text
              className="text-xs uppercase tracking-widest"
              style={{ color: draft.serviceLineColorHex ?? '#A78445' }}
            >
              ● {draft.serviceLineName}
            </Text>
          </View>

          <Text className="text-text text-4xl mt-3" style={{ fontFamily: 'serif' }}>
            Define the{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              scope.
            </Text>
          </Text>
          <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
            Tell us the rooms and we'll size the crew.
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!cleanTypes && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {cleanTypes && (
          <>
            <View className="px-5 mt-8">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Clean type</Text>
              <View className="flex-row mt-3 gap-3">
                {cleanTypes.map((ct) => (
                  <CleanTypeChip
                    key={ct.id}
                    cleanType={ct}
                    selected={draft.cleanTypeCode === ct.code}
                    onPress={() => setCleanType({ cleanTypeCode: ct.code as CleanTypeCode, cleanTypeName: ct.name })}
                  />
                ))}
              </View>
            </View>

            <View className="mx-5 mt-6 rounded-xl bg-surface border border-border">
              <Counter
                label="Bedrooms"
                value={draft.bedrooms}
                onChange={(v) => setScope({ bedrooms: v, bathrooms: draft.bathrooms, livingRooms: draft.livingRooms, squareMeters: draft.squareMeters })}
              />
              <Divider />
              <Counter
                label="Bathrooms"
                value={draft.bathrooms}
                onChange={(v) => setScope({ bedrooms: draft.bedrooms, bathrooms: v, livingRooms: draft.livingRooms, squareMeters: draft.squareMeters })}
              />
              <Divider />
              <Counter
                label="Living rooms"
                value={draft.livingRooms}
                onChange={(v) => setScope({ bedrooms: draft.bedrooms, bathrooms: draft.bathrooms, livingRooms: v, squareMeters: draft.squareMeters })}
              />
              <Divider />
              <View className="flex-row items-center justify-between px-4 py-3">
                <Text className="text-text text-base">Square meters</Text>
                <View className="flex-row items-center">
                  <TextInput
                    value={draft.squareMeters?.toString() ?? ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/\D/g, ''), 10);
                      setScope({
                        bedrooms: draft.bedrooms,
                        bathrooms: draft.bathrooms,
                        livingRooms: draft.livingRooms,
                        squareMeters: Number.isNaN(n) ? null : n,
                      });
                    }}
                    placeholder="~120"
                    placeholderTextColor="#A09886"
                    keyboardType="number-pad"
                    className="text-text text-base w-20 text-right"
                  />
                  <Text className="text-text-muted ml-1">m²</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {addOns && addOns.length > 0 && (
          <>
            <View className="px-5 mt-8">
              <Text className="text-text-muted text-xs uppercase tracking-widest">Add-ons</Text>
            </View>
            <View className="mx-5 mt-3 rounded-xl bg-surface border border-border">
              {addOns.map((a, idx) => (
                <View key={a.id}>
                  <AddOnRow
                    addOn={a}
                    selected={draft.addOnCodes.includes(a.code)}
                    onToggle={() => toggleAddOn(a.code)}
                  />
                  {idx < addOns.length - 1 && <Divider />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View className="absolute left-5 right-5 bottom-8">
        <Pressable
          onPress={() => router.push('/(app)/booking/schedule')}
          disabled={!canContinue}
          className="items-center rounded-lg bg-gold px-4 py-4"
          style={{ opacity: canContinue ? 1 : 0.5 }}
        >
          <Text className="text-surface-dark text-base font-semibold">Continue to schedule</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CleanTypeChip({
  cleanType,
  selected,
  onPress,
}: {
  cleanType: CleanTypeDto;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-xl border px-3 py-3"
      style={{
        backgroundColor: selected ? '#1B1814' : '#FFFFFF',
        borderColor: selected ? '#1B1814' : '#E2DCC9',
      }}
    >
      <Text
        className="text-lg font-medium"
        style={{ fontFamily: 'serif', color: selected ? '#F5F1E6' : '#1B1814' }}
      >
        {cleanType.name}
      </Text>
      {cleanType.subtitle && (
        <Text className="text-xs mt-0.5" style={{ color: selected ? '#B6AC9A' : '#5C544A' }}>
          {cleanType.subtitle}
        </Text>
      )}
    </Pressable>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Text className="text-text text-base">{label}</Text>
      <View className="flex-row items-center">
        <Pressable
          onPress={() => onChange(Math.max(0, value - 1))}
          className="h-9 w-9 items-center justify-center rounded-md bg-bg-muted"
        >
          <Text className="text-text text-lg">−</Text>
        </Pressable>
        <Text className="text-text text-lg w-8 text-center" style={{ fontFamily: 'serif' }}>
          {value}
        </Text>
        <Pressable
          onPress={() => onChange(Math.min(20, value + 1))}
          className="h-9 w-9 items-center justify-center rounded-md bg-gold"
        >
          <Text className="text-surface-dark text-lg">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AddOnRow({ addOn, selected, onToggle }: { addOn: AddOnDto; selected: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center px-4 py-3">
      <View
        className="h-6 w-6 rounded-md items-center justify-center"
        style={{ backgroundColor: selected ? '#C9A55C' : '#FFFFFF', borderWidth: 1, borderColor: selected ? '#C9A55C' : '#E2DCC9' }}
      >
        {selected && <Text className="text-surface-dark text-xs">✓</Text>}
      </View>
      <Text className="text-text text-base ml-3 flex-1">{addOn.name}</Text>
      <Text className="text-gold-deep text-sm">+ {(addOn.priceCents / 100).toLocaleString()}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View className="h-px bg-border mx-4" />;
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
