import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { BookingDto } from '@onyxhawk/types';

import { api, ApiError } from '../../src/api/client';

type ViewMode = 'month' | 'week' | 'list';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Mockup 09 — calendar of the customer's bookings.
export default function CalendarScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('month');

  const todayStr = nairobiDateStr(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayStr.split('-').map(Number);
    return { year: y!, month: (m! - 1) };
  });
  const [selected, setSelected] = useState<string>(todayStr);

  const load = useCallback(async () => {
    try {
      const res = await api.listBookings();
      setBookings([...res.upcoming, ...res.past]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load calendar (${err.status}).` : 'Could not load calendar.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Index bookings by Nairobi calendar day.
  const byDay = useMemo(() => {
    const map = new Map<string, BookingDto[]>();
    for (const b of bookings ?? []) {
      const key = nairobiDateStr(new Date(b.scheduledAt));
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [bookings]);

  const selectedBookings = byDay.get(selected) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Your calendar</Text>
        <View className="h-10 w-10" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-2">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            <Text className="text-gold-deep italic">{monthName(cursor.month)}</Text> {cursor.year}
          </Text>
        </View>

        <View className="mx-5 mt-5 flex-row rounded-xl bg-surface border border-border p-1">
          <Tab label="Month" active={mode === 'month'} onPress={() => setMode('month')} />
          <Tab label="Week" active={mode === 'week'} onPress={() => setMode('week')} />
          <Tab label="List" active={mode === 'list'} onPress={() => setMode('list')} />
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!bookings && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {bookings && mode === 'month' && (
          <MonthGrid
            cursor={cursor}
            byDay={byDay}
            today={todayStr}
            selected={selected}
            onSelect={setSelected}
            onPrev={() => setCursor(shiftMonth(cursor, -1))}
            onNext={() => setCursor(shiftMonth(cursor, 1))}
          />
        )}

        {bookings && mode === 'week' && (
          <WeekStrip byDay={byDay} today={todayStr} selected={selected} onSelect={setSelected} />
        )}

        {bookings && mode === 'list' && (
          <AgendaList byDay={byDay} onOpen={(id) => router.push({ pathname: '/(app)/bookings/[id]', params: { id } })} />
        )}

        {bookings && mode !== 'list' && (
          <Legend />
        )}

        {bookings && mode !== 'list' && (
          <View className="px-5 mt-6">
            <Text className="text-gold-deep text-xs uppercase tracking-widest">
              {labelForDay(selected)} {selected === todayStr ? '· Today' : '· Selected'}
            </Text>
            {selectedBookings.length === 0 ? (
              <View className="mt-3 rounded-xl bg-surface border border-border px-4 py-6 items-center">
                <Text className="text-text-muted text-sm">Nothing scheduled this day.</Text>
              </View>
            ) : (
              selectedBookings.map((b) => (
                <DayBookingCard
                  key={b.id}
                  booking={b}
                  onPress={() => router.push({ pathname: '/(app)/bookings/[id]', params: { id: b.id } })}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MonthGrid({
  cursor,
  byDay,
  today,
  selected,
  onSelect,
  onPrev,
  onNext,
}: {
  cursor: { year: number; month: number };
  byDay: Map<string, BookingDto[]>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const cells = useMemo(() => buildMonthCells(cursor.year, cursor.month), [cursor]);

  return (
    <View className="mx-5 mt-4 rounded-2xl bg-surface border border-border p-4">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={onPrev} className="h-9 w-9 items-center justify-center rounded-full bg-bg-muted">
          <Text className="text-text text-lg">‹</Text>
        </Pressable>
        <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>
          {monthName(cursor.month)} {cursor.year}
        </Text>
        <Pressable onPress={onNext} className="h-9 w-9 items-center justify-center rounded-full bg-bg-muted">
          <Text className="text-text text-lg">›</Text>
        </Pressable>
      </View>

      <View className="flex-row mt-4">
        {WEEKDAYS.map((d, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-text-muted text-xs">{d}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap mt-2">
        {cells.map((cell, i) => (
          <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
            {cell ? (
              <DayCell
                dateStr={cell.dateStr}
                day={cell.day}
                bookings={byDay.get(cell.dateStr) ?? []}
                isToday={cell.dateStr === today}
                isSelected={cell.dateStr === selected}
                onPress={() => onSelect(cell.dateStr)}
              />
            ) : (
              <View style={{ height: 44 }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DayCell({
  dateStr,
  day,
  bookings,
  isToday,
  isSelected,
  onPress,
}: {
  dateStr: string;
  day: number;
  bookings: BookingDto[];
  isToday: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const dots = bookings.slice(0, 3);
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center rounded-lg"
      style={{
        height: 44,
        width: 40,
        backgroundColor: isSelected ? '#1B1814' : isToday ? '#E6CFA033' : 'transparent',
      }}
    >
      <Text
        className="text-base"
        style={{ fontFamily: 'serif', color: isSelected ? '#F5F1E6' : '#1B1814' }}
      >
        {day}
      </Text>
      <View className="flex-row mt-0.5" style={{ height: 5, gap: 2 }}>
        {dots.map((b, i) => (
          <View key={i} className="rounded-full" style={{ width: 5, height: 5, backgroundColor: serviceColor(b.serviceLineCode) }} />
        ))}
      </View>
    </Pressable>
  );
}

function WeekStrip({
  byDay,
  today,
  selected,
  onSelect,
}: {
  byDay: Map<string, BookingDto[]>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
}) {
  const days = useMemo(() => weekAround(selected), [selected]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} className="mt-4">
      {days.map((d) => {
        const isSel = d.dateStr === selected;
        const has = (byDay.get(d.dateStr) ?? []).length > 0;
        return (
          <Pressable
            key={d.dateStr}
            onPress={() => onSelect(d.dateStr)}
            className="rounded-xl mr-2 border items-center justify-center"
            style={{
              width: 52,
              paddingVertical: 10,
              backgroundColor: isSel ? '#1B1814' : '#FFFFFF',
              borderColor: isSel ? '#1B1814' : d.dateStr === today ? '#C9A55C' : '#E2DCC9',
            }}
          >
            <Text className="text-[10px] uppercase tracking-widest" style={{ color: isSel ? '#B6AC9A' : '#5C544A' }}>
              {d.weekday}
            </Text>
            <Text className="text-lg mt-0.5" style={{ fontFamily: 'serif', color: isSel ? '#F5F1E6' : '#1B1814' }}>
              {d.day}
            </Text>
            <View style={{ height: 6 }}>
              {has && <View className="rounded-full mt-0.5" style={{ width: 5, height: 5, backgroundColor: '#C9A55C' }} />}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AgendaList({ byDay, onOpen }: { byDay: Map<string, BookingDto[]>; onOpen: (id: string) => void }) {
  const sortedDays = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  if (sortedDays.length === 0) {
    return (
      <View className="mx-5 mt-6 rounded-xl bg-surface border border-border px-4 py-8 items-center">
        <Text className="text-text-muted text-sm">No bookings to show.</Text>
      </View>
    );
  }
  return (
    <View className="px-5 mt-4">
      {sortedDays.map((day) => (
        <View key={day} className="mt-4">
          <Text className="text-gold-deep text-xs uppercase tracking-widest">{labelForDay(day)}</Text>
          {(byDay.get(day) ?? []).map((b) => (
            <DayBookingCard key={b.id} booking={b} onPress={() => onOpen(b.id)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayBookingCard({ booking, onPress }: { booking: BookingDto; onPress: () => void }) {
  const time = new Date(booking.scheduledAt).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Pressable onPress={onPress} className="mt-3 rounded-xl bg-surface-dark p-4 flex-row items-center">
      <View className="rounded-lg border border-gold/40 px-3 py-2 items-center">
        <Text className="text-gold text-base" style={{ fontFamily: 'serif' }}>{time}</Text>
      </View>
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: serviceColor(booking.serviceLineCode) }} />
          <Text className="text-xs uppercase tracking-widest ml-1.5" style={{ color: serviceColor(booking.serviceLineCode) }}>
            {serviceLabel(booking.serviceLineCode)}
          </Text>
        </View>
        <Text className="text-text-on-dark text-base mt-1" style={{ fontFamily: 'serif' }}>
          {cleanTypeLabel(booking.cleanTypeCode)}{booking.scope.bedrooms > 0 ? ` · ${booking.scope.bedrooms}-bed` : ''}
        </Text>
        <Text className="text-text-on-dark-muted text-xs mt-0.5">
          {booking.address.label} · {formatDuration(booking.estimatedDurationMinutes)} est.
        </Text>
      </View>
    </Pressable>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ['Residential', '#4F7B5C'],
    ['Office', '#3A5E7A'],
    ['Post-build', '#C97E3B'],
    ['Fumigation', '#6B4E8C'],
  ];
  return (
    <View className="mx-5 mt-4 flex-row flex-wrap" style={{ gap: 12 }}>
      {items.map(([label, color]) => (
        <View key={label} className="flex-row items-center">
          <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: color }} />
          <Text className="text-text-muted text-xs ml-1.5">{label}</Text>
        </View>
      ))}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center rounded-lg py-2" style={{ backgroundColor: active ? '#1B1814' : 'transparent' }}>
      <Text className="text-sm" style={{ color: active ? '#F5F1E6' : '#5C544A' }}>{label}</Text>
    </Pressable>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────

interface MonthCell { day: number; dateStr: string }

function buildMonthCells(year: number, month: number): Array<MonthCell | null> {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const firstWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const cells: Array<MonthCell | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${year}-${pad(month + 1)}-${pad(d)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekAround(dateStr: string): Array<{ dateStr: string; day: number; weekday: string }> {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!, 12));
  const dow = base.getUTCDay();
  const sunday = new Date(base.getTime() - dow * 86_400_000);
  const out: Array<{ dateStr: string; day: number; weekday: string }> = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(sunday.getTime() + i * 86_400_000);
    out.push({
      dateStr: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
      day: dt.getUTCDate(),
      weekday: WEEKDAYS[dt.getUTCDay()]!,
    });
  }
  return out;
}

function shiftMonth(cursor: { year: number; month: number }, delta: number): { year: number; month: number } {
  const m = cursor.month + delta;
  const year = cursor.year + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return { year, month };
}

function nairobiDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

function labelForDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12));
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase();
}

function monthName(month: number): string {
  return new Date(Date.UTC(2020, month, 1, 12)).toLocaleDateString('en-US', { month: 'long' });
}

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function serviceColor(code: string): string {
  switch (code) {
    case 'residential': return '#4F7B5C';
    case 'office': return '#3A5E7A';
    case 'hospital': return '#A8556B';
    case 'post_build': return '#C97E3B';
    case 'fumigation': return '#6B4E8C';
    default: return '#C9A55C';
  }
}

function serviceLabel(code: string): string {
  switch (code) {
    case 'residential': return 'Residential';
    case 'office': return 'Office';
    case 'hospital': return 'Hospital';
    case 'post_build': return 'Post-build';
    case 'fumigation': return 'Fumigation';
    default: return code;
  }
}

function cleanTypeLabel(code: string): string {
  switch (code) {
    case 'deep': return 'Deep clean';
    case 'move_out': return 'Move-out clean';
    case 'recurring': return 'Recurring clean';
    default: return 'Standard clean';
  }
}
