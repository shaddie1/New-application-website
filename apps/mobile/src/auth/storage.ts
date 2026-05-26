import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Session } from '@onyxhawk/types';

const KEY = 'onyxhawk.session';

// expo-secure-store is unavailable on web; fall back to localStorage.
async function readRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function removeRaw(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export async function loadSession(): Promise<Session | null> {
  const raw = await readRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    await removeRaw();
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await writeRaw(JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await removeRaw();
}
