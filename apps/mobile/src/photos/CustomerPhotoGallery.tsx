import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator } from 'react-native';
import type { BookingPhotosResult, RoomPhotoGroup } from '@onyxhawk/types';

import { api, ApiError } from '../api/client';

interface Props {
  bookingId: string;
  /** When true and there are no photos, render a gentle empty state. */
  showEmptyState?: boolean;
}

// Customer-facing before/after gallery (mockup 11), read-only.
export function CustomerPhotoGallery({ bookingId, showEmptyState }: Props) {
  const [data, setData] = useState<BookingPhotosResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getBookingPhotos(bookingId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load photos (${err.status}).` : 'Could not load photos.');
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return <Text className="text-danger text-sm">{error}</Text>;
  }
  if (!data) {
    return <ActivityIndicator color="#C9A55C" />;
  }

  if (data.rooms.length === 0) {
    if (!showEmptyState) return null;
    return (
      <Text className="text-text-muted text-sm text-center">
        Photos will appear here once the crew has documented your clean.
      </Text>
    );
  }

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-text-muted text-xs uppercase tracking-widest">Before & after</Text>
        <Text className="text-gold-deep text-xs">
          {data.documentedRoomCount} room{data.documentedRoomCount === 1 ? '' : 's'} documented
        </Text>
      </View>

      {data.rooms.map((room) => (
        <RoomRow key={room.room} group={room} />
      ))}
    </View>
  );
}

function RoomRow({ group }: { group: RoomPhotoGroup }) {
  return (
    <View className="mt-3">
      <Text className="text-text text-base mb-2" style={{ fontFamily: 'serif' }}>
        {group.room}
      </Text>
      <View className="flex-row" style={{ gap: 12 }}>
        <Pane label="Before" url={group.before?.url ?? null} />
        <Pane label="After" url={group.after?.url ?? null} />
      </View>
    </View>
  );
}

function Pane({ label, url }: { label: string; url: string | null }) {
  return (
    <View
      className="flex-1 rounded-lg overflow-hidden items-center justify-center"
      style={{ aspectRatio: 1, backgroundColor: '#EDE7D8' }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text className="text-text-muted text-xs">No {label.toLowerCase()} photo</Text>
      )}
      <View className="absolute top-1 left-1 rounded bg-surface-dark/70 px-1.5 py-0.5">
        <Text className="text-text-on-dark text-[10px] uppercase tracking-widest">{label}</Text>
      </View>
    </View>
  );
}
