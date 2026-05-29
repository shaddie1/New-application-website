import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { AddressDto } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/api/client';

// Saved addresses manager — list, add, edit, set-default, delete.
export default function AddressesScreen() {
  const router = useRouter();
  const [addresses, setAddresses] = useState<AddressDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listAddresses();
      setAddresses(res.addresses);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Could not load addresses (${err.status}).` : 'Could not load addresses.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSetDefault = async (a: AddressDto) => {
    try {
      await api.updateAddress(a.id, { isDefault: true });
      await load();
    } catch {
      Alert.alert('Address', 'Could not set as default.');
    }
  };

  const handleDelete = (a: AddressDto) => {
    Alert.alert('Delete address', `Remove "${a.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAddress(a.id);
            await load();
          } catch {
            Alert.alert('Address', 'Could not delete that address.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="px-5 pt-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">‹</Text>
        </Pressable>
        <Text className="text-text-muted text-xs uppercase tracking-widest">Saved addresses</Text>
        <Pressable onPress={() => setEditing('new')} className="h-10 w-10 items-center justify-center rounded-full bg-surface">
          <Text className="text-text text-xl">＋</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-4">
          <Text className="text-text text-4xl" style={{ fontFamily: 'serif' }}>
            Your{' '}
            <Text className="text-gold-deep italic" style={{ fontFamily: 'serif' }}>
              spaces.
            </Text>
          </Text>
        </View>

        {error && (
          <View className="mx-5 mt-6 rounded-lg bg-danger/10 px-4 py-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {!addresses && !error && (
          <View className="mt-12 items-center">
            <ActivityIndicator color="#C9A55C" />
          </View>
        )}

        {addresses && addresses.length === 0 && (
          <View className="mx-5 mt-8 rounded-xl bg-surface border border-border px-5 py-8 items-center">
            <Text className="text-text-muted text-sm text-center">No saved addresses yet.</Text>
            <Pressable onPress={() => setEditing('new')} className="mt-4 rounded-lg bg-gold px-4 py-2">
              <Text className="text-surface-dark text-sm font-semibold">Add an address</Text>
            </Pressable>
          </View>
        )}

        <View className="px-5 mt-3">
          {(addresses ?? []).map((a) => (
            <View key={a.id} className="mt-3 rounded-xl bg-surface border border-border p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-text text-lg" style={{ fontFamily: 'serif' }}>{a.label}</Text>
                {a.isDefault && (
                  <View className="rounded-pill bg-gold-soft px-2 py-0.5">
                    <Text className="text-gold-deep text-xs uppercase tracking-widest">Default</Text>
                  </View>
                )}
              </View>
              <Text className="text-text-muted text-sm mt-1">
                {a.line1}{a.area ? ` · ${a.area}` : ''}, {a.city}
              </Text>
              {a.accessNotes ? <Text className="text-text-muted text-xs mt-1">Access: {a.accessNotes}</Text> : null}

              <View className="flex-row mt-3" style={{ gap: 8 }}>
                {!a.isDefault && (
                  <Pressable onPress={() => handleSetDefault(a)} className="rounded-md border border-border px-3 py-1.5">
                    <Text className="text-text text-sm">Set default</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => setEditing(a)} className="rounded-md border border-border px-3 py-1.5">
                  <Text className="text-text text-sm">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(a)} className="rounded-md border border-border px-3 py-1.5">
                  <Text className="text-danger text-sm">Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <AddressEditor
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />
    </SafeAreaView>
  );
}

function AddressEditor({
  target,
  onClose,
  onSaved,
}: {
  target: AddressDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = target === 'new';
  const existing = target && target !== 'new' ? target : null;

  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [accessNotes, setAccessNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setLabel(existing.label);
      setLine1(existing.line1);
      setArea(existing.area ?? '');
      setCity(existing.city);
      setAccessNotes(existing.accessNotes ?? '');
    } else if (isNew) {
      setLabel('');
      setLine1('');
      setArea('');
      setCity('Nairobi');
      setAccessNotes('');
    }
  }, [target]);

  const visible = target !== null;

  const handleSave = async () => {
    if (!label.trim() || !line1.trim()) {
      Alert.alert('Address', 'Label and street line are required.');
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await api.updateAddress(existing.id, {
          label: label.trim(),
          line1: line1.trim(),
          area: area.trim() || null,
          city: city.trim() || 'Nairobi',
          accessNotes: accessNotes.trim() || null,
        });
      } else {
        await api.createAddress({
          label: label.trim(),
          line1: line1.trim(),
          area: area.trim() || undefined,
          city: city.trim() || 'Nairobi',
          accessNotes: accessNotes.trim() || undefined,
        });
      }
      onSaved();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload
          ? String((err.payload as { error: unknown }).error)
          : 'Could not save the address.';
      Alert.alert('Address', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-surface-dark/60 justify-end">
        <View className="bg-bg rounded-t-2xl px-5 pt-6 pb-10">
          <View className="h-1.5 w-12 self-center rounded-full bg-border" />
          <Text className="text-text text-2xl mt-4" style={{ fontFamily: 'serif' }}>
            {existing ? 'Edit address' : 'New address'}
          </Text>

          <Field label="Label"><TextInput value={label} onChangeText={setLabel} placeholder="Home" placeholderTextColor="#A09886" className="text-text text-base" /></Field>
          <Field label="Street / building"><TextInput value={line1} onChangeText={setLine1} placeholder="Riverside Drive · Apt 14B" placeholderTextColor="#A09886" className="text-text text-base" /></Field>
          <Field label="Area"><TextInput value={area} onChangeText={setArea} placeholder="Westlands" placeholderTextColor="#A09886" className="text-text text-base" /></Field>
          <Field label="City"><TextInput value={city} onChangeText={setCity} placeholder="Nairobi" placeholderTextColor="#A09886" className="text-text text-base" /></Field>
          <Field label="Access notes (optional)"><TextInput value={accessNotes} onChangeText={setAccessNotes} placeholder="Gate code, lift floor…" placeholderTextColor="#A09886" className="text-text text-base" /></Field>

          <View className="mt-5 flex-row" style={{ gap: 12 }}>
            <Pressable onPress={onClose} className="flex-1 items-center rounded-lg bg-surface border border-border py-3">
              <Text className="text-text text-base">Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} className="flex-1 items-center rounded-lg bg-gold py-3" style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator color="#1B1814" /> : <Text className="text-surface-dark text-base font-semibold">Save</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-3">
      <Text className="text-text-muted text-xs uppercase tracking-widest mb-1.5">{label}</Text>
      <View className="rounded-lg bg-surface border border-border px-4 py-3">{children}</View>
    </View>
  );
}
