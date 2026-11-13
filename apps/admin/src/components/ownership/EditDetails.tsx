'use client';

import { useId, useRef, useState } from 'react';
import type { ShareholderDto, ShareholderKind } from '@onyxhawk/types';
import { api } from '../../lib/api';
import { useBlock } from '../dashboard/useBlock';
import { refusalMessage } from '../project-money/PlacementPicker';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { NOT_LINKED, linkInput, linkOptions, linkRefusal } from './link';
import { SelectField } from './SelectField';

const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm';
const fieldLabel = 'block text-xs text-text-muted mb-1';

/**
 * One holder's name, title, type and linked sign-in. Their stake is not here:
 * stakes change only in Edit stakes, where every holder is saved together.
 */
export function EditDetails({
  holder, holders, onOpenChange, onSaved,
}: {
  /** The holder to edit. The dialog is open while this is not null. */
  holder: ShareholderDto | null;
  /** Every current holder, which says the sign-ins already linked to someone else. */
  holders: ShareholderDto[];
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
            holders={holders}
            onSaved={onSaved}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailsForm({
  holder, holders, onSaved, onClose,
}: {
  holder: ShareholderDto;
  holders: ShareholderDto[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(holder.name);
  const [title, setTitle] = useState(holder.title ?? '');
  const [kind, setKind] = useState<ShareholderKind>(holder.kind);
  const [link, setLink] = useState(holder.userId ?? NOT_LINKED);
  // The staff sign-ins, asked for each time the form opens. Until they arrive
  // the choice shows the link as it stands and cannot be changed; the other
  // fields save without it.
  const staffBlock = useBlock(async () => (await api.staff()).staff, []);
  const options = linkOptions(staffBlock.status === 'loaded' ? staffBlock.data : [], holders, holder);
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
      await api.updateShareholder(holder.id, {
        name: name.trim(), title: title.trim() || null, kind, ...linkInput(holder.userId, link),
      });
    } catch (err) {
      const said = refusalMessage(err, 'Could not save the details. Try again.');
      setRefusal(linkRefusal(said, link, holders, holder) ?? said);
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
        <div>
          <label htmlFor={`${id}-link`} className={fieldLabel}>Linked sign-in</label>
          <SelectField
            id={`${id}-link`}
            className="disabled:opacity-60"
            value={link}
            disabled={staffBlock.status !== 'loaded'}
            aria-describedby={staffBlock.status === 'loaded' ? undefined : `${id}-link-state`}
            onChange={(e) => setLink(e.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.unavailable}>{option.label}</option>
            ))}
          </SelectField>
          {staffBlock.status === 'loading' && (
            <p id={`${id}-link-state`} role="status" className="mt-1 text-xs text-text-muted">Loading the sign-ins…</p>
          )}
          {staffBlock.status === 'failed' && (
            <div id={`${id}-link-state`} role="alert" className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-danger">
              <span>Could not load the sign-ins.</span>
              {/* Not a submit button: this sits inside the form. */}
              <Button type="button" variant="outline" size="sm" onClick={staffBlock.retry} aria-label="Retry loading the sign-ins">
                Retry
              </Button>
            </div>
          )}
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
