'use client';

import { useEffect, useState } from 'react';
import type { AdminStaffDto, StaffRole } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useAuth } from '../../../src/lib/auth';

const e164 = (input: string): string => {
  const d = input.replace(/\D/g, '');
  if (d.startsWith('254')) return `+${d}`;
  if (d.startsWith('0')) return `+254${d.slice(1)}`;
  if (d.length === 9) return `+254${d}`;
  return `+${d}`;
};

export default function TeamPage() {
  const { session } = useAuth();
  const isOwner = !!session?.user.isOwner;

  const [staff, setStaff] = useState<AdminStaffDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('ADMIN');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await api.staff();
      setStaff(r.staff);
    } catch (e) {
      setError(msg(e, 'Could not load the team.'));
    }
  }

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner]);

  if (!session) return null;
  if (!isOwner) {
    return (
      <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">
        Only the account owner can manage the team.
      </div>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !fullName.trim()) {
      setError('Enter a name and phone number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.addStaff({ phone: e164(phone), fullName: fullName.trim(), role });
      setPhone('');
      setFullName('');
      setRole('ADMIN');
      await load();
    } catch (err) {
      setError(msg(err, 'Could not add the team member.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(member: AdminStaffDto) {
    if (!confirm(`Remove ${member.fullName} from the team? They’ll become a normal customer.`)) return;
    setError(null);
    try {
      await api.removeStaff(member.id);
      await load();
    } catch (err) {
      setError(msg(err, 'Could not remove the team member.'));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>
          Team
        </h1>
        <p className="text-text-muted text-sm mt-1">Add or remove admins and support staff. Only you (owner) can do this.</p>
      </div>

      {error && <div className="rounded-lg bg-danger/10 px-4 py-3 text-danger text-sm">{error}</div>}

      {/* Add member */}
      <form onSubmit={add} className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium text-text">Add a team member</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-text outline-none focus:border-gold"
          />
          <div className="flex items-center rounded-lg border border-border bg-surface px-3 py-2">
            <span className="text-text-muted mr-1 text-sm">+254</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="712 345 678"
              inputMode="tel"
              className="flex-1 bg-transparent text-text outline-none"
            />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-text outline-none focus:border-gold"
          >
            <option value="ADMIN">Admin</option>
            <option value="SUPPORT">Support</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gold py-2 font-semibold text-surface-dark disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add member'}
          </button>
        </div>
        <p className="text-text-muted text-xs mt-3">
          They sign in at this portal with their phone number. If the number already has an account, it’s promoted.
        </p>
      </form>

      {/* Current team */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-muted text-text-muted">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Name</th>
              <th className="px-5 py-3 text-left font-medium">Phone</th>
              <th className="px-5 py-3 text-left font-medium">Role</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff?.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 text-text">{m.fullName}</td>
                <td className="px-5 py-3 text-text-muted">{m.phone}</td>
                <td className="px-5 py-3">
                  {m.isOwner ? (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold-deep">Owner</span>
                  ) : (
                    <span className="text-text-muted">{m.role === 'ADMIN' ? 'Admin' : 'Support'}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {m.isOwner || m.id === session.user.id ? (
                    <span className="text-text-muted text-xs">—</span>
                  ) : (
                    <button onClick={() => remove(m)} className="text-danger text-sm hover:underline">
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {staff && staff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-text-muted">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!staff && <div className="px-5 py-6 text-text-muted text-sm">Loading…</div>}
      </div>
    </div>
  );
}

function msg(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === 'object' && err.payload && 'error' in err.payload) {
    return String((err.payload as { error: unknown }).error);
  }
  return fallback;
}
