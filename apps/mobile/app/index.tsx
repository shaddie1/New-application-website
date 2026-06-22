import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { ServiceLineDto } from '@onyxhawk/types';
import { api } from '../src/api/client';

const SERVICE_ICONS: Record<string, string> = {
  RESIDENTIAL: '🏠',
  OFFICE: '🏢',
  HOSPITAL: '🏥',
  POST_BUILD: '🏗️',
  FUMIGATION: '💨',
  SOFA: '🛋️',
  CARPET: '🪤',
  MATTRESS: '🛏️',
  CURTAIN: '🪟',
  AC_DUCT: '❄️',
  MOULD: '🧹',
};

// Shown while the API loads or if it's unreachable
const PLACEHOLDER_SERVICES: ServiceLineDto[] = [
  { id: '1', code: 'residential', name: 'Residential Cleaning', tagline: 'Apartments, bungalows, maisonettes', badge: 'MOST_BOOKED', imageUrl: null, colorHex: '#4F7B5C', quoteOnly: false, fromPriceCents: 350000 },
  { id: '2', code: 'office', name: 'Office Cleaning', tagline: 'Workplaces, co-working spaces', badge: 'NONE', imageUrl: null, colorHex: '#3A5E7A', quoteOnly: false, fromPriceCents: 500000 },
  { id: '3', code: 'hospital', name: 'Medical Facility Cleaning', tagline: 'Clinics, hospitals, labs', badge: 'CERTIFIED', imageUrl: null, colorHex: '#A8556B', quoteOnly: true, fromPriceCents: null },
  { id: '4', code: 'post_build', name: 'Post-Construction', tagline: 'After renovation or building', badge: 'NONE', imageUrl: null, colorHex: '#C97E3B', quoteOnly: false, fromPriceCents: 800000 },
  { id: '5', code: 'fumigation', name: 'Fumigation', tagline: 'Pest control & sanitation', badge: 'NONE', imageUrl: null, colorHex: '#6B4E8C', quoteOnly: true, fromPriceCents: null },
];

const TRUST_BADGES = [
  { icon: '🛡️', label: 'Fully insured' },
  { icon: '🌿', label: 'Eco-friendly' },
  { icon: '⚡', label: 'Same-day' },
];

function getIcon(code: string): string {
  return SERVICE_ICONS[code.toUpperCase()] ?? '✨';
}

function formatBadge(badge: string): string {
  if (badge === 'MOST_BOOKED') return 'Most booked';
  if (badge === 'CERTIFIED') return 'Certified';
  if (badge === 'NEW') return 'New';
  return '';
}

export default function LandingScreen() {
  const router = useRouter();
  // Start with placeholders so the page is never blank
  const [lines, setLines] = useState<ServiceLineDto[]>(PLACEHOLDER_SERVICES);

  useEffect(() => {
    let active = true;
    api
      .getServiceLines()
      .then((res) => {
        if (active && res.serviceLines.length > 0) setLines(res.serviceLines);
      })
      .catch(() => {
        // API unavailable — placeholders remain visible
      });
    return () => {
      active = false;
    };
  }, []);

  const goSignIn = () => router.push('/(auth)/sign-in');

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <View className="flex-row items-center justify-between px-5 pt-3">
          <View>
            <Text className="text-text text-base font-semibold" style={{ fontFamily: 'serif' }}>
              OnyxHawk
            </Text>
            <Text className="text-text-muted text-[10px] uppercase tracking-widest">Est. 2019</Text>
          </View>
          <Pressable
            onPress={goSignIn}
            className="rounded-full border border-border bg-surface px-4 py-2"
          >
            <Text className="text-text text-sm font-medium">Sign in</Text>
          </Pressable>
        </View>

        {/* ── Hero panel ───────────────────────────────────────────────── */}
        <View className="bg-surface-dark mt-5 px-6 pt-10 pb-8">
          <Text className="text-text-on-dark-muted text-xs uppercase tracking-widest">
            Nairobi's trusted clean
          </Text>
          <Text
            className="text-text-on-dark mt-3 text-5xl leading-tight"
            style={{ fontFamily: 'serif' }}
          >
            Professional
          </Text>
          <Text
            className="text-text-on-dark text-5xl leading-tight"
            style={{ fontFamily: 'serif' }}
          >
            cleaning.
          </Text>
          <Text
            className="text-gold text-5xl italic leading-tight"
            style={{ fontFamily: 'serif' }}
          >
            Booked in
          </Text>
          <Text
            className="text-gold text-5xl italic leading-tight"
            style={{ fontFamily: 'serif' }}
          >
            minutes.
          </Text>
          <Text className="text-text-on-dark-muted mt-4 text-sm leading-relaxed">
            Homes, offices, hospitals &amp; more — one trusted crew, scheduled around your day.
          </Text>

          {/* Trust badges */}
          <View className="flex-row flex-wrap gap-2 mt-6">
            {TRUST_BADGES.map((b) => (
              <View
                key={b.label}
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
                style={{
                  backgroundColor: 'rgba(201,165,92,0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(201,165,92,0.3)',
                }}
              >
                <Text style={{ fontSize: 11 }}>{b.icon}</Text>
                <Text className="text-gold text-xs">{b.label}</Text>
              </View>
            ))}
          </View>

          {/* Stats row */}
          <View className="flex-row mt-8 gap-6">
            <StatPill value="500+" label="Happy clients" />
            <StatPill value="4.9 ★" label="Average rating" />
            <StatPill value="2,000+" label="Cleans done" />
          </View>
        </View>

        {/* ── Services section ─────────────────────────────────────────── */}
        <View className="px-5 mt-10">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Our services</Text>
          <Text className="text-text mt-1 text-3xl" style={{ fontFamily: 'serif' }}>
            What needs{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              cleaning?
            </Text>
          </Text>
          <Text className="text-text-muted mt-1 text-sm">
            Tap any service to book — login takes under a minute.
          </Text>
        </View>

        {(
          <View className="px-5 mt-4 gap-3">
            {lines.map((line) => (
              <ServiceCard key={line.id} line={line} onPress={goSignIn} />
            ))}
          </View>
        )}

        {/* ── Bottom CTA ───────────────────────────────────────────────── */}
        <View className="mx-5 mt-10 rounded-2xl bg-surface-dark px-6 py-8">
          <Text className="text-text-on-dark-muted text-xs uppercase tracking-widest">
            Ready to book?
          </Text>
          <Text className="text-text-on-dark text-3xl mt-2" style={{ fontFamily: 'serif' }}>
            Join 500+ happy{' '}
            <Text className="text-gold italic" style={{ fontFamily: 'serif' }}>
              clients.
            </Text>
          </Text>
          <Text className="text-text-on-dark-muted text-sm mt-2 leading-relaxed">
            Create a free account in under a minute.{'\n'}Love it or it&apos;s free — guaranteed.
          </Text>

          <Pressable
            onPress={goSignIn}
            className="mt-6 items-center rounded-xl bg-gold px-5 py-4"
          >
            <Text className="text-surface-dark text-base font-semibold">
              Get started — it&apos;s free
            </Text>
          </Pressable>

          <Pressable
            onPress={goSignIn}
            className="mt-3 items-center rounded-xl border border-border px-5 py-3.5"
          >
            <Text className="text-text-on-dark text-base">Sign in to existing account</Text>
          </Pressable>
        </View>

        <Text className="text-text-muted text-xs text-center mt-8 px-8 leading-relaxed">
          Your phone number is never shared or sold.{'\n'}Browsing is always free.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text className="text-gold text-xl font-semibold" style={{ fontFamily: 'serif' }}>
        {value}
      </Text>
      <Text className="text-text-on-dark-muted text-xs mt-0.5">{label}</Text>
    </View>
  );
}

function ServiceCard({
  line,
  onPress,
}: {
  line: ServiceLineDto;
  onPress: () => void;
}) {
  const color = line.colorHex ?? '#C9A55C';
  const icon = getIcon(line.code);
  const badge = formatBadge(line.badge);

  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl overflow-hidden bg-surface border border-border"
    >
      {/* Color accent top band */}
      <View style={{ height: 5, backgroundColor: color }} />

      <View className="p-4 flex-row items-start">
        {/* Service icon blob */}
        <View
          className="h-16 w-16 items-center justify-center rounded-xl mr-4 flex-shrink-0"
          style={{ backgroundColor: color + '22' }}
        >
          <Text style={{ fontSize: 30 }}>{icon}</Text>
        </View>

        <View className="flex-1">
          {/* Name + badge */}
          <View className="flex-row items-center gap-2">
            <Text
              className="text-text text-lg font-semibold flex-1"
              style={{ fontFamily: 'serif' }}
            >
              {line.name}
            </Text>
            {badge !== '' && (
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: color + '28' }}
              >
                <Text className="text-xs font-medium" style={{ color }}>
                  {badge}
                </Text>
              </View>
            )}
          </View>

          {/* Tagline */}
          {!!line.tagline && (
            <Text className="text-text-muted text-sm mt-1 leading-snug" numberOfLines={2}>
              {line.tagline}
            </Text>
          )}

          {/* Price + CTA arrow */}
          <View className="flex-row items-center justify-between mt-3">
            <Text className="text-xs uppercase tracking-wider font-semibold" style={{ color }}>
              {line.quoteOnly
                ? 'Get a free quote'
                : line.fromPriceCents
                ? `From KSh ${(line.fromPriceCents / 100).toLocaleString()}`
                : 'Book now'}
            </Text>
            <Text className="text-text-muted text-lg">›</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
