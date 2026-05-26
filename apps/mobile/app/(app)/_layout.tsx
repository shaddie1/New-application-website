import { Stack } from 'expo-router';
import { colors } from '@onyxhawk/ui-tokens';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
