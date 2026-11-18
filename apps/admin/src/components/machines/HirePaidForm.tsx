'use client';

import { useId, useState } from 'react';
import type { MachineDetailDto, MachineLineDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatDay } from '../ownership/wording';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { describedField, field, Field, FormFooter, Refusal, todayIso, useSave } from './FormParts';
import { hireLabel } from './wording';

/**
 * R14: mark a hire paid, with the day it was paid and an optional reference.
 * The mark changes no figure (R15): a hire counts from the day it was
 * recorded, paid or not.
 */
export function HirePaidForm({
  line, onSaved, onClose,
}: {
  /** The hire being marked. */
  line: MachineLineDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [paidOn, setPaidOn] = useState(todayIso);
  const [reference, setReference] = useState('');
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  const dateProblem = paidOn === '' ? 'Choose the day it was paid.' : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateProblem) return;
    void save(
      () => api.markMachineHirePaid(line.id, { paidOn, ...(reference.trim() ? { reference: reference.trim() } : {}) }),
      'Could not mark the hire paid. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Mark hire paid</DialogTitle>
        <DialogDescription>
          {hireLabel(line)} from {formatDay(line.date)}, charged {money(line.chargedCents ?? 0)}. Marking it paid
          changes no figure.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-paid-on`} label="Paid on" problem={dateProblem}>
          <input
            {...describedField(`${id}-paid-on`, dateProblem)}
            type="date"
            className={field}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
        <Field id={`${id}-reference`} label="Reference (optional)">
          <input
            id={`${id}-reference`}
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder="M-Pesa code or bank transfer reference"
            className={field}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </DialogBody>

      <FormFooter saving={saving} label="Mark paid" />
    </form>
  );
}
