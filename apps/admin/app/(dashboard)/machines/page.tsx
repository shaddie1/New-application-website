'use client';

import { useEffect, useState } from 'react';
import type { MachineDetailDto, MachinesAccessDto } from '@onyxhawk/types';

import { api } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { MachineDetail } from '../../../src/components/machines/MachineDetail';
import { registerHasTwoRates } from '../../../src/components/machines/forms';
import { AddMachineForm, GiveRateForm } from '../../../src/components/machines/MachineForm';
import { LoadFailed, MachineTable } from '../../../src/components/machines/MachineTable';
import { Button } from '../../../src/components/ui/button';
import { Dialog, DialogContent } from '../../../src/components/ui/dialog';

/** The two ways a machine joins the register (F1). */
type AddForm = 'new' | 'from-asset';

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
  // The owner's form for adding a machine. It stays set after its dialog
  // closes, so it keeps its place while the dialog fades out.
  const [addForm, setAddForm] = useState<AddForm>('new');
  const [addOpen, setAddOpen] = useState(false);
  // Counts the openings: each one mounts its form afresh.
  const [opening, setOpening] = useState(0);

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

  // KTD6: the back-office and the API go live separately. An API from before
  // the two rates would drop a rate typed here and store the machine's own, so
  // until the register shows the API knows both rates, the page offers no form
  // and no machine. Null while the register is being asked for.
  const [apiCurrent, setApiCurrent] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const canView = access?.canView ?? false;
  useEffect(() => {
    if (!canView) return;
    let live = true;
    setApiCurrent(null);
    setCheckFailed(false);
    api
      .machineRegister()
      .then((r) => { if (live) setApiCurrent(registerHasTwoRates(r.register)); })
      .catch(() => { if (live) setCheckFailed(true); });
    return () => { live = false; };
  }, [canView, attempt]);

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
  if (checkFailed) return <LoadFailed what="the Machines page" onRetry={() => setAttempt((a) => a + 1)} />;
  if (apiCurrent === null) return <div className="text-charcoal-muted">Loading…</div>;
  if (!apiCurrent) {
    return (
      <div>
        <h1 className="mb-6 font-serif text-3xl">Machines</h1>
        <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-charcoal">
          The site is still updating. Reload in a few minutes.
        </div>
      </div>
    );
  }

  const openAdd = (form: AddForm) => {
    setAddForm(form);
    setOpening((n) => n + 1);
    setAddOpen(true);
  };
  // The new machine is opened straight away: its investors are named there.
  const added = (machine: MachineDetailDto) => setOpenId(machine.id);

  // The owner's two ways of adding a machine, above the table and under "No machines yet".
  const addControls = (className: string) => (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <Button onClick={() => openAdd('new')}>Add a machine</Button>
      <Button variant="outline" onClick={() => openAdd('from-asset')}>Give an existing asset a rate</Button>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl">Machines</h1>
        <p className="mt-1 text-sm text-charcoal-muted">
          What each machine cost, what it has earned back and who that money belongs to.
        </p>
        {access.canEdit && !openId && addControls('mt-4')}
      </div>

      {openId ? (
        <MachineDetail machineId={openId} canEdit={access.canEdit} onBack={() => setOpenId(null)} />
      ) : (
        <MachineTable onOpen={setOpenId} emptyAction={access.canEdit ? addControls('justify-center') : undefined} />
      )}

      {access.canEdit && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            {addForm === 'new' ? (
              <AddMachineForm key={opening} onAdded={added} onClose={() => setAddOpen(false)} />
            ) : (
              <GiveRateForm key={opening} onAdded={added} onClose={() => setAddOpen(false)} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
