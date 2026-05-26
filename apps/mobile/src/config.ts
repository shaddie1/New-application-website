import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolve the API base URL.
 * 1. Explicit override via app.json `extra.apiUrl`
 * 2. Android emulator → 10.0.2.2 (loopback to host)
 * 3. iOS sim / web → localhost
 */
function resolveApiUrl(): string {
  const explicit = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (explicit) return explicit;
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:4000`;
}

export const API_URL = resolveApiUrl();
