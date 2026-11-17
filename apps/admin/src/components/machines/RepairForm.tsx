'use client';

import { useId, useState } from 'react';
import type { MachineDetailDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { formatDay } from '../ownership/wording';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { describedField, field, Field, FormFooter, Refusal, todayIso, useSave } from './FormParts';
import { parseAmount } from './forms';

/** A repair on a machine. Its cost comes out of the machine's pot, not out of profit. */
export function RepairForm({
  machine: m, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(todayIso);
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [tried, setTried] = useState(false);
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  const costRead = parseAmount(cost, { orZero: true });
  // Days are YYYY-MM-DD, which sort as text.
  const dateProblem =
    date === ''
      ? 'Choose the date.'
      : date < m.startDay
        ? `This machine’s pot counts from ${formatDay(m.startDay)}. An earlier repair does not come out of it.`
        : null;
  const descriptionProblem = tried && description.trim() === '' ? 'Say what was repaired.' : null;
  const costProblem = tried || cost.trim() !== '' ? (costRead.ok ? null : costRead.reason) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (dateProblem || description.trim() === '' || !costRead.ok) return;
    void save(
      () => api.addMachineRepair(m.id, {
        date,
        description: description.trim(),
        costCents: costRead.cents,
        ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {}),
      }),
      'Could not add the repair. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Add a repair</DialogTitle>
        <DialogDescription>
          The cost comes out of {m.name}’s pot. The asset list shows it as maintenance on the same machine.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-what`} label="What was repaired" problem={descriptionProblem}>
          <input
            {...describedField(`${id}-what`, descriptionProblem)}
            type="text"
            autoComplete="off"
            maxLength={500}
            placeholder="e.g. New brush motor"
            className={field}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-date`} label="Date" problem={dateProblem}>
            <input
              {...describedField(`${id}-date`, dateProblem)}
              type="date"
              min={m.startDay}
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-cost`} label="Cost (KSh)" problem={costProblem}>
            <input
              {...describedField(`${id}-cost`, costProblem)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 10000"
              className={field}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </div>
        <Field id={`${id}-by`} label="Who did it (optional)">
          <input
            id={`${id}-by`}
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder="e.g. The supplier’s workshop"
            className={field}
            value={performedBy}
            onChange={(e) => setPerformedBy(e.target.value)}
          />
        </Field>
      </DialogBody>

      <FormFooter saving={saving} label="Add repair" />
    </form>
  );
}
