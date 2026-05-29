import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { QuoteFrequency, ServiceLineCode } from '@onyxhawk/types';

import { api, ApiError } from '../../src/api/client';

const SERVICE_LINES: Array<{ code: ServiceLineCode; label: string }> = [
  { code: 'residential', label: 'Residential' },
  { code: 'office', label: 'Office' },
  { code: 'hospital', label: 'Hospital' },
  { code: 'post_build', label: 'Post-build' },
  { code: 'fumigation', label: 'Fumigation' },
];

const FREQUENCIES: Array<{ value: QuoteFrequency; label: string }> = [
  { value: 'NONE', label: 'One-off' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

// Mockup 12 — request a walkthrough/quote for larger jobs.
export default function QuoteRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ serviceLineCode?: string }>();
  const initialLine = SERVICE_LINES.find((l) => l.code === params.serviceLineCode)?.code ?? 'office';

  const [serviceLineCode, setServiceLineCode] = useState<ServiceLineCode>(initialLine);
  const [siteType, setSiteType] = useState('');
  const [sqm, setSqm] = useState('');
  const [floors, setFloors] = useState('');
  const [frequency, setFrequency] = useState<QuoteFrequency>('NONE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!siteType.trim()) {
      Alert.alert('Quote', 'Tell us the site type (e.g. "Open-plan office · 4 floors").');
      return;
    }
    setSubmitting(true);
    try {
      await api.createQuoteRequest({
        serviceLineCode,
        siteType: siteType.trim(),
        approxSqm: sqm ? parseInt(sqm.replace(/\D/g, ''), 10) || undefined : undefined,
        floors: floors ? parseInt(floors.replace(/\D/g, ''), 10) || undefined : undefined,
        frequency,
        notes: notes.trim() || undefined,
      });
      router.replace('/(app)/quotes');
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not submit your request.';
      Alert.alert('Quote', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Walkthrough request</Text>
        <View className="h-10 w-10" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="px-5 pt-4">
            <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
              Request a{' '}
              <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
                quote.
              </Text>
            </Text>
            <Text className="text-text-muted mt-2 italic" style={{ fontFamily: 'serif' }}>
              For larger jobs we send a lead to your site within 48 hours.
            </Text>
          </View>

          <Section label="Service line">
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {SERVICE_LINES.map((l) => (
                <Chip key={l.code} label={l.label} active={serviceLineCode === l.code} onPress={() => setServiceLineCode(l.code)} />
              ))}
            </View>
          </Section>

          <Section label="Site type">
            <View className="rounded-lg bg-surface border border-border px-4 py-3">
              <TextInput
                value={siteType}
                onChangeText={setSiteType}
                placeholder="Open-plan office · 4 floors"
                placeholderTextColor="#A09886"
                className="text-text text-base"
              />
            </View>
          </Section>

          <View className="px-5 mt-5 flex-row" style={{ gap: 12 }}>
            <View className="flex-1">
              <Text className="text-text-muted text-xs uppercase tracking-widest mb-2">Approx. square meters</Text>
              <View className="rounded-lg bg-surface border border-border px-4 py-3">
                <TextInput value={sqm} onChangeText={setSqm} placeholder="~1,800" placeholderTextColor="#A09886" keyboardType="number-pad" className="text-text text-base" />
              </View>
            </View>
            <View style={{ width: 110 }}>
              <Text className="text-text-muted text-xs uppercase tracking-widest mb-2">Floors</Text>
              <View className="rounded-lg bg-surface border border-border px-4 py-3">
                <TextInput value={floors} onChangeText={setFloors} placeholder="4" placeholderTextColor="#A09886" keyboardType="number-pad" className="text-text text-base" />
              </View>
            </View>
          </View>

          <Section label="Frequency needed">
            <View className="flex-row" style={{ gap: 8 }}>
              {FREQUENCIES.map((f) => (
                <Chip key={f.value} label={f.label} active={frequency === f.value} onPress={() => setFrequency(f.value)} grow />
              ))}
            </View>
          </Section>

          <Section label="Notes for the crew lead (optional)">
            <View className="rounded-lg bg-surface border border-border px-4 py-3">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Access hours, security desk, special surfaces…"
                placeholderTextColor="#A09886"
                multiline
                className="text-text text-base"
                style={{ minHeight: 64 }}
              />
            </View>
          </Section>

          <Text className="text-text-muted text-xs mx-5 mt-4">
            Photos of the site can be added once a lead reaches out. We'll confirm a walkthrough time by phone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <View className="absolute left-5 right-5 bottom-8">
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="items-center rounded-lg bg-gold px-4 py-4"
          style={{ opacity: submitting ? 0.6 : 1 }}
        >
          {submitting ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Send request</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="px-5 mt-6">
      <Text className="text-text-muted text-xs uppercase tracking-widest mb-2">{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, grow }: { label: string; active: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-pill border px-4 py-2"
      style={{
        backgroundColor: active ? '#1B1814' : '#FFFFFF',
        borderColor: active ? '#1B1814' : '#E2DCC9',
        flexGrow: grow ? 1 : 0,
        alignItems: 'center',
      }}
    >
      <Text className="text-sm" style={{ color: active ? '#F5F1E6' : '#1B1814' }}>{label}</Text>
    </Pressable>
  );
}
