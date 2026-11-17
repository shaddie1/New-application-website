'use client';

import { useEffect, useState } from 'react';
import type { MachinesAccessDto } from '@onyxhawk/types';

import { api } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { MachineDetail } from '../../../src/components/machines/MachineDetail';
import { LoadFailed, MachineTable } from '../../../src/components/machines/MachineTable';

export default function MachinesPage() {
  const session = useRequireAdmin();
  // Who may see the register, and who may change it, is the server's to say:
  // it depends on the role and on a link to a current shareholder record.
  // Nothing else is asked for until it has said yes.
  const [access, setAccess] = useState<MachinesAccessDto | null>(null);
  const [accessFailed, setAccessFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The machine that is open, in place of the table. The admin is a static
  // export, so a machine has no address of its own.
  const [openId, setOpenId] = useState<string | null>(null);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    setAccess(null);
    setAccessFailed(false);
    api
      .machinesAccess()
      .then((r) => { if (live) setAccess(r.access); })
      .catch(() => { if (live) setAccessFailed(true); });
    return () => { live = false; };
  }, [userId, attempt]);

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;
  if (accessFailed) return <LoadFailed what="the Machines page" onRetry={() => setAttempt((a) => a + 1)} />;
  if (!access) return <div className="text-charcoal-muted">Loading…</div>;
  if (!access.canView) {
    return (
      <div className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
        You do not have access to the Machines page.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl">Machines</h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          What each machine cost, what it has earned back and who that money belongs to.
        </p>
      </div>

      {openId ? (
        <MachineDetail machineId={openId} canEdit={access.canEdit} onBack={() => setOpenId(null)} />
      ) : (
        <MachineTable onOpen={setOpenId} />
      )}
    </div>
  );
}
