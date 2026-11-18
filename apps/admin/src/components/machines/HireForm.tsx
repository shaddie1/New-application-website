'use client';

import { useId, useState } from 'react';
import type { MachineDetailDto, MachineLineDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatDay } from '../ownership/wording';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  DeclaredWarning, describedField, field, Field, FormFooter, Refusal, todayIso, useDeclaredPeriods, useSave, Warning,
} from './FormParts';
import { amountPreview, belowRateWarning, fieldDays, fieldShillings, parseAmount, parseDays } from './forms';

/**
 * A hire to an outside customer: log one, or correct one when `line` is given.
 * A hire is a one-off job with the amount charged as its income; the machine
 * gets days x its rate out of that and the rest is profit.
 */
export function HireForm({
  machine: m, line, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  /** The hire being corrected. Left out to log a new one. */
  line?: MachineLineDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [customer, setCustomer] = useState(line?.customerName ?? '');
  const [startDate, setStartDate] = useState(() => line?.date ?? todayIso());
  const [days, setDays] = useState(line ? fieldDays(line.halfDays) : '');
  // A hire that was given free opens as "0", not as a blank.
  const [charged, setCharged] = useState(line ? fieldShillings(line.chargedCents ?? 0) || '0' : '');
  // A correction opens with every field filled, so what is wrong shows at once.
  const [tried, setTried] = useState(line !== undefined);
  const declared = useDeclaredPeriods(m.id);
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  // A hire already logged keeps the rate it was logged at.
  const rateCents = line?.rateCents ?? m.dailyRateCents;
  const daysRead = parseDays(days);
  const chargedRead = parseAmount(charged, { orZero: true });

  const customerProblem = tried && customer.trim() === '' ? 'Enter the customer’s name.' : null;
  // Days are YYYY-MM-DD, which sort as text.
  const dateProblem =
    startDate === ''
      ? 'Choose the start date.'
      : startDate < m.startDay
        ? `This machine counts from ${formatDay(m.startDay)}. A hire before that day cannot be logged.`
        : null;
  const daysProblem = tried || days.trim() !== '' ? (daysRead.ok ? null : daysRead.reason) : null;
  const chargedProblem = tried || charged.trim() !== '' ? (chargedRead.ok ? null : chargedRead.reason) : null;

  const preview = amountPreview(days, rateCents);
  const daysHint = preview ? `${preview} goes into the pot.` : 'In halves: 0.5 is a morning, 2.5 is two and a half days.';
  const chargedHint = 'What the customer pays for the hire. What is left after the machine’s amount is profit.';

  const unchanged =
    line !== undefined &&
    customer.trim() === (line.customerName ?? '') &&
    startDate === line.date &&
    daysRead.ok && daysRead.halfDays === line.halfDays &&
    chargedRead.ok && chargedRead.cents === line.chargedCents;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (customer.trim() === '' || dateProblem || !daysRead.ok || !chargedRead.ok || unchanged) return;
    const input = {
      customerName: customer.trim(),
      startDate,
      halfDays: daysRead.halfDays,
      chargedCents: chargedRead.cents,
    };
    void save(
      () => (line ? api.editMachineHire(line.id, input) : api.logMachineHire(m.id, input)),
      line ? 'Could not save the hire. Try again.' : 'Could not log the hire. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{line ? 'Edit hire' : 'Log a hire'}</DialogTitle>
        <DialogDescription>
          {line
            ? `The hire’s one-off job in Jobs & costs changes with it. This hire keeps the rate it was logged at, ${money(rateCents)} a day.`
            : `The hire becomes a one-off job in Jobs & costs, with the amount charged as its income. ${m.name} earns ${money(rateCents)} a day. Add the hire’s other costs to that job.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-customer`} label="Customer" problem={customerProblem}>
          <input
            {...describedField(`${id}-customer`, customerProblem)}
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder="e.g. Mwangi Hardware"
            className={field}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-start`} label="Start date" problem={dateProblem}>
            <input
              {...describedField(`${id}-start`, dateProblem)}
              type="date"
              min={m.startDay}
              className={field}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-days`} label="Days" problem={daysProblem} hint={daysHint}>
            <input
              {...describedField(`${id}-days`, daysProblem, daysHint)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 3"
              className={field}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        </div>
        <Field id={`${id}-charged`} label="Amount charged (KSh)" problem={chargedProblem} hint={chargedHint}>
          <input
            {...describedField(`${id}-charged`, chargedProblem, chargedHint)}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 10500"
            className={field}
            value={charged}
            onChange={(e) => setCharged(e.target.value)}
          />
        </Field>

        <Warning>
          {daysRead.ok && chargedRead.ok ? belowRateWarning(daysRead.halfDays, rateCents, chargedRead.cents) : null}
        </Warning>
        <DeclaredWarning date={dateProblem ? '' : startDate} periods={declared.periods} failed={declared.failed} onRetry={declared.retry} />
      </DialogBody>

      {/* Not saved until the declared payouts have been checked, so the warning is seen first. */}
      <FormFooter saving={saving} disabled={unchanged || declared.checking} label={line ? 'Save' : 'Log hire'} />
    </form>
  );
}
