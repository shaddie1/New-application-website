'use client';

import { useId, useRef, useState } from 'react';
import type { ShareholderDto, ShareholderKind } from '@onyxhawk/types';
import { api } from '../../lib/api';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { SelectField } from './SelectField';

const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm';
const fieldLabel = 'block text-xs text-text-muted mb-1';

/**
 * One holder's name, title and type. Their stake is not here: stakes change
 * only in Edit stakes, where every holder is saved together.
 */
export function EditDetails({
  holder, onOpenChange, onSaved,
}: {
  /** The holder to edit. The dialog is open while this is not null. */
  holder: ShareholderDto | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a save, so the page can reload the table. */
  onSaved: () => void;
}) {
  // Kept after closing so the form stays put while the dialog fades out.
  const shown = useRef(holder);
  if (holder) shown.current = holder;

  return (
    <Dialog open={holder !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        {shown.current && (
          <DetailsForm
            key={shown.current.id}
            holder={shown.current}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailsForm({
  holder, onSaved, onClose,
}: {
  holder: ShareholderDto;
  onSaved: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(holder.name);
  const [title, setTitle] = useState(holder.title ?? '');
  const [kind, setKind] = useState<ShareholderKind>(holder.kind);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const nameMissing = name.trim() === '';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current || nameMissing) return;
    busy.current = true;
    setSaving(true);
    setRefusal(null);
    try {
      await api.updateShareholder(holder.id, { name: name.trim(), title: title.trim() || null, kind });
    } catch (err) {
      setRefusal(refusalMessage(err, 'Could not save the details. Try again.'));
      return;
    } finally {
      busy.current = false;
      setSaving(false);
    }
    onSaved();
    onClose();
  };

  return (
    <form className="contents" onSubmit={(e) => void save(e)} noValidate>
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {refusal && (
          <div role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{refusal}</div>
        )}
        <div>
          <label htmlFor={`${id}-name`} className={fieldLabel}>Name</label>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            maxLength={200}
            aria-invalid={nameMissing ? true : undefined}
            aria-describedby={nameMissing ? `${id}-name-reason` : undefined}
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {nameMissing && <p id={`${id}-name-reason`} className="mt-1 text-xs text-danger">Enter a name.</p>}
        </div>
        <div>
          <label htmlFor={`${id}-title`} className={fieldLabel}>Title (optional)</label>
          <input
            id={`${id}-title`}
            type="text"
            autoComplete="off"
            maxLength={100}
            placeholder="e.g. Director, COO"
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className={fieldLabel}>Type</label>
          <SelectField id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as ShareholderKind)}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="COMPANY">Company</option>
          </SelectField>
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={saving || nameMissing}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </form>
  );
}
