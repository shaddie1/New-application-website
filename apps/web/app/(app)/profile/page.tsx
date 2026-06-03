'use client';

import { useEffect, useState } from 'react';
import type {
  AddressDto,
  NotificationChannel,
  NotificationPreferenceDto,
  ProfileOverview,
} from '@onyxhawk/types';

import { api, apiErrorMessage } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';
import { formatDate } from '../../../src/lib/format';
import { Banner, Button, Card, Field, Input, Pill, Spinner } from '../../../src/components/ui';

export default function ProfilePage() {
  const { session, setSession } = useAuth();
  const [profile, setProfile] = useState<ProfileOverview | null>(null);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferenceDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getProfile(), api.listAddresses(), api.getNotificationPrefs()])
      .then(([p, a, n]) => {
        setProfile(p.profile);
        setAddresses(a.addresses);
        setPrefs(n.preferences);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  if (!profile) {
    return (
      <div className="flex justify-center py-20 text-text-muted">
        {error ? <Banner>{error}</Banner> : <Spinner />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl text-text">Profile</h1>
      {error ? <Banner>{error}</Banner> : null}

      {/* Overview */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-serif text-2xl text-text">{profile.user.fullName}</p>
            <p className="text-sm text-text-muted">{profile.user.phone}</p>
            {profile.user.email ? <p className="text-sm text-text-muted">{profile.user.email}</p> : null}
          </div>
          <Pill className="bg-gold-soft text-gold-deep">{profile.tier}</Pill>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
          <Stat label="Bookings" value={String(profile.bookingsCount)} />
          <Stat label="Points" value={profile.pointsBalance.toLocaleString()} />
          <Stat label="Member since" value={formatDate(profile.memberSince)} />
        </div>
      </Card>

      <EditDetails
        profile={profile}
        onSaved={(user) => {
          setProfile({ ...profile, user });
          if (session) setSession({ ...session, user });
        }}
      />

      <Addresses addresses={addresses} setAddresses={setAddresses} />

      <Notifications prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-text">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

function EditDetails({
  profile,
  onSaved,
}: {
  profile: ProfileOverview;
  onSaved: (user: ProfileOverview['user']) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile.user.fullName);
  const [email, setEmail] = useState(profile.user.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.updateProfile({ fullName: fullName.trim(), email: email.trim() || null });
      onSaved(r.user);
      setEditing(false);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">Account details</h2>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm text-gold-deep hover:underline">
            Edit
          </button>
        ) : null}
      </div>
      <Card className="space-y-4">
        {editing ? (
          <>
            <Field label="Full name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
            </Field>
            {error ? <Banner>{error}</Banner> : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setFullName(profile.user.fullName);
                  setEmail(profile.user.email ?? '');
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">Update your name and email used for receipts.</p>
        )}
      </Card>
    </section>
  );
}

function Addresses({
  addresses,
  setAddresses,
}: {
  addresses: AddressDto[];
  setAddresses: React.Dispatch<React.SetStateAction<AddressDto[]>>;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!line1.trim()) {
      setError('Enter the street address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.createAddress({
        label: label.trim() || 'Home',
        line1: line1.trim(),
        area: area.trim() || undefined,
        city: city.trim() || undefined,
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, r.address]);
      setAdding(false);
      setLine1('');
      setArea('');
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    try {
      await api.updateAddress(id, { isDefault: true });
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this address?')) return;
    try {
      await api.deleteAddress(id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-muted">Addresses</h2>
        {!adding ? (
          <button onClick={() => setAdding(true)} className="text-sm text-gold-deep hover:underline">
            + Add
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        {addresses.map((a) => (
          <Card key={a.id} className="flex items-start justify-between">
            <div>
              <p className="flex items-center gap-2 font-medium text-text">
                {a.label}
                {a.isDefault ? <Pill className="bg-gold-soft text-gold-deep">Default</Pill> : null}
              </p>
              <p className="text-sm text-text-muted">
                {a.line1}
                {a.area ? `, ${a.area}` : ''} · {a.city}
              </p>
            </div>
            <div className="flex shrink-0 gap-3 text-sm">
              {!a.isDefault ? (
                <button onClick={() => makeDefault(a.id)} className="text-gold-deep hover:underline">
                  Set default
                </button>
              ) : null}
              <button onClick={() => remove(a.id)} className="text-danger hover:underline">
                Remove
              </button>
            </div>
          </Card>
        ))}

        {addresses.length === 0 && !adding ? (
          <Card className="text-sm text-text-muted">No saved addresses yet.</Card>
        ) : null}

        {adding ? (
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </Field>
              <Field label="Area">
                <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Westlands" />
              </Field>
            </div>
            <Field label="Street address">
              <Input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="123 Riverside Dr" />
            </Field>
            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            {error ? <Banner>{error}</Banner> : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={add} disabled={busy}>
                {busy ? <Spinner /> : 'Save address'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
      {error && !adding ? <div className="mt-2"><Banner>{error}</Banner></div> : null}
    </section>
  );
}

const CHANNELS: { channel: NotificationChannel; label: string; hint: string }[] = [
  { channel: 'SMS', label: 'SMS', hint: 'Booking updates by text' },
  { channel: 'PUSH', label: 'Push', hint: 'In-app notifications' },
  { channel: 'EMAIL', label: 'Email', hint: 'Receipts and summaries' },
];

function Notifications({
  prefs,
  setPrefs,
}: {
  prefs: NotificationPreferenceDto[];
  setPrefs: React.Dispatch<React.SetStateAction<NotificationPreferenceDto[]>>;
}) {
  const [error, setError] = useState<string | null>(null);

  function enabledFor(channel: NotificationChannel): boolean {
    return prefs.find((p) => p.channel === channel)?.enabled ?? false;
  }

  async function toggle(channel: NotificationChannel) {
    const next = !enabledFor(channel);
    // Optimistic
    setPrefs((prev) => {
      const existing = prev.find((p) => p.channel === channel);
      if (existing) return prev.map((p) => (p.channel === channel ? { ...p, enabled: next } : p));
      return [...prev, { channel, enabled: next }];
    });
    try {
      await api.updateNotificationPref({ channel, enabled: next });
    } catch (e) {
      setError(apiErrorMessage(e));
      // Revert
      setPrefs((prev) => prev.map((p) => (p.channel === channel ? { ...p, enabled: !next } : p)));
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-muted">Notifications</h2>
      <Card>
        <div className="space-y-1">
          {CHANNELS.map((c) => {
            const on = enabledFor(c.channel);
            return (
              <div key={c.channel} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-text">{c.label}</p>
                  <p className="text-xs text-text-muted">{c.hint}</p>
                </div>
                <button
                  onClick={() => toggle(c.channel)}
                  role="switch"
                  aria-checked={on}
                  className={`relative h-6 w-11 rounded-pill transition-colors ${on ? 'bg-gold' : 'bg-border-strong'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-pill bg-surface transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
        {error ? <div className="mt-2"><Banner>{error}</Banner></div> : null}
      </Card>
    </section>
  );
}
