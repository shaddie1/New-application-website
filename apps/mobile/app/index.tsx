import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder Home screen — visual sketch of mockup 03.
// The booking flow / data plumbing is the next pass; this is just enough to
// confirm the design tokens, fonts, and NativeWind setup all wire up.
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-2">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Tuesday · 26 May</Text>
          <Text className="text-text mt-2 text-4xl" style={{ fontFamily: 'serif' }}>
            Good morning,
          </Text>
          <Text className="text-gold-deep text-4xl italic" style={{ fontFamily: 'serif' }}>
            Aluoch.
          </Text>
        </View>

        <View className="mx-5 mt-8 rounded-xl bg-surface-dark p-5">
          <View className="self-start rounded-pill bg-service-residential/20 px-3 py-1">
            <Text className="text-service-residential text-xs uppercase tracking-widest">● Residential</Text>
          </View>
          <Text className="text-text-on-dark mt-3 text-2xl" style={{ fontFamily: 'serif' }}>
            Deep clean
          </Text>
          <Text className="text-gold italic text-lg" style={{ fontFamily: 'serif' }}>
            3-bedroom apartment
          </Text>

          <View className="mt-4 flex-row justify-between">
            <Column label="TODAY" value="2:30 PM" />
            <Column label="CREW" value="4 + lead" />
            <Column label="EST." value="3h 30m" />
          </View>

          <Pressable className="mt-4 self-end rounded-lg bg-gold px-4 py-2">
            <Text className="text-surface-dark font-semibold">Track →</Text>
          </Pressable>
        </View>

        <View className="mt-8 px-5">
          <Text className="text-text-muted text-xs uppercase tracking-widest">Book a clean</Text>
          <Text className="text-text mt-1 text-3xl" style={{ fontFamily: 'serif' }}>
            What needs sweeping?
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Column({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-on-dark-muted text-[10px] uppercase tracking-widest">{label}</Text>
      <Text className="text-text-on-dark mt-1 text-base font-medium">{value}</Text>
    </View>
  );
}
