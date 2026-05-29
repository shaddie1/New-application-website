import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { BookingPhotosResult, RoomPhotoGroup } from '@onyxhawk/types';

import { api, uploadCrewPhoto, ApiError } from '../api/client';

interface Props {
  bookingId: string;
  /** Rooms to show even before any photo exists (derived from booking scope). */
  defaultRooms: string[];
  /** Crew can only capture while the job is on-site/in-progress. */
  editable: boolean;
  onChange?: () => void;
}

// Crew-facing per-room BEFORE/AFTER capture grid.
export function CrewPhotoSection({ bookingId, defaultRooms, editable, onChange }: Props) {
  const [data, setData] = useState<BookingPhotosResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [extraRooms, setExtraRooms] = useState<string[]>([]);
  const [newRoom, setNewRoom] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.getCrewJobPhotos(bookingId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load photos (${err.status}).` : 'Could not load photos.');
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  // Union of default rooms, any room with photos, and rooms the user added.
  const rooms = useMemo(() => {
    const fromPhotos = (data?.rooms ?? []).map((r) => r.room);
    const set = new Set<string>([...defaultRooms, ...fromPhotos, ...extraRooms]);
    return [...set];
  }, [data, defaultRooms, extraRooms]);

  const groupFor = (room: string): RoomPhotoGroup | undefined => data?.rooms.find((r) => r.room === room);

  const capture = async (room: string, kind: 'BEFORE' | 'AFTER') => {
    const uri = await pickImage();
    if (!uri) return;
    const key = `${room}:${kind}`;
    setBusyKey(key);
    try {
      await uploadCrewPhoto({ bookingId, room, kind, localUri: uri });
      await load();
      onChange?.();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 503
          ? 'Photo storage is not configured yet. Ask an admin to set up R2.'
          : 'Upload failed. Check your connection and try again.';
      Alert.alert('Photo', msg);
    } finally {
      setBusyKey(null);
    }
  };

  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    setExtraRooms((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewRoom('');
  };

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-text-muted text-xs uppercase tracking-widest">Documentation</Text>
        {data && (
          <Text className="text-gold-deep text-xs">
            {data.documentedRoomCount} room{data.documentedRoomCount === 1 ? '' : 's'} documented
          </Text>
        )}
      </View>

      {error && <Text className="text-danger text-sm mt-2">{error}</Text>}
      {!data && !error && <ActivityIndicator color="#C9A55C" className="mt-4" />}

      {data &&
        rooms.map((room) => {
          const g = groupFor(room);
          return (
            <View key={room} className="mt-3 rounded-xl bg-surface border border-border p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-text text-base" style={{ fontFamily: 'serif' }}>{room}</Text>
                {g?.documented && (
                  <View className="rounded-pill bg-success/15 px-2 py-0.5">
                    <Text className="text-success text-xs">Done</Text>
                  </View>
                )}
              </View>

              <View className="flex-row mt-3" style={{ gap: 12 }}>
                <Slot
                  label="Before"
                  photoUrl={g?.before?.url ?? null}
                  busy={busyKey === `${room}:BEFORE`}
                  editable={editable}
                  onPress={() => capture(room, 'BEFORE')}
                />
                <Slot
                  label="After"
                  photoUrl={g?.after?.url ?? null}
                  busy={busyKey === `${room}:AFTER`}
                  editable={editable}
                  onPress={() => capture(room, 'AFTER')}
                />
              </View>
            </View>
          );
        })}

      {editable && (
        <View className="mt-3 flex-row items-center" style={{ gap: 8 }}>
          <View className="flex-1 rounded-lg bg-surface border border-border px-3 py-2">
            <TextInput
              value={newRoom}
              onChangeText={setNewRoom}
              placeholder="Add a room (e.g. Balcony)"
              placeholderTextColor="#A09886"
              className="text-text text-sm"
              onSubmitEditing={addRoom}
              returnKeyType="done"
            />
          </View>
          <Pressable onPress={addRoom} className="rounded-lg bg-surface-dark px-4 py-2.5">
            <Text className="text-text-on-dark text-sm">Add</Text>
          </Pressable>
        </View>
      )}

      {editable && (
        <Text className="text-text-muted text-xs mt-3">
          Each room with a before AND after photo earns the customer bonus Hawk Points on completion.
        </Text>
      )}
    </View>
  );
}

function Slot({
  label,
  photoUrl,
  busy,
  editable,
  onPress,
}: {
  label: string;
  photoUrl: string | null;
  busy: boolean;
  editable: boolean;
  onPress: () => void;
}) {
  const content = (
    <View
      className="flex-1 rounded-lg overflow-hidden items-center justify-center"
      style={{ aspectRatio: 1, backgroundColor: '#EDE7D8' }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : busy ? (
        <ActivityIndicator color="#C9A55C" />
      ) : (
        <Text className="text-text-muted text-2xl">{editable ? '＋' : '–'}</Text>
      )}
      <View className="absolute top-1 left-1 rounded bg-surface-dark/70 px-1.5 py-0.5">
        <Text className="text-text-on-dark text-[10px] uppercase tracking-widest">{label}</Text>
      </View>
    </View>
  );

  if (!editable || busy) return <View className="flex-1">{content}</View>;
  return (
    <Pressable className="flex-1" onPress={onPress}>
      {content}
    </Pressable>
  );
}

/** Ask the user to take a photo or pick from the library; return a local URI. */
async function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.alert('Add photo', undefined, [
      {
        text: 'Take photo',
        onPress: async () => resolve(await launch('camera')),
      },
      {
        text: 'Choose from library',
        onPress: async () => resolve(await launch('library')),
      },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

async function launch(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is required to take photos.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    return res.canceled ? null : res.assets[0]?.uri ?? null;
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Library', 'Photo library permission is required.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
  return res.canceled ? null : res.assets[0]?.uri ?? null;
}

/** Default room list from a booking's scope. */
export function defaultRoomsForScope(scope: { bedrooms: number; bathrooms: number; livingRooms: number }): string[] {
  const rooms: string[] = ['Kitchen'];
  for (let i = 1; i <= Math.max(0, scope.livingRooms); i++) rooms.push(scope.livingRooms > 1 ? `Living room ${i}` : 'Living room');
  for (let i = 1; i <= Math.max(0, scope.bedrooms); i++) rooms.push(`Bedroom ${i}`);
  for (let i = 1; i <= Math.max(0, scope.bathrooms); i++) rooms.push(scope.bathrooms > 1 ? `Bathroom ${i}` : 'Bathroom');
  return rooms;
}
