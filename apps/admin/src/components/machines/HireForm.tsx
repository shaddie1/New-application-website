'use client';

import { useId, useState } from 'react';
import type { EditMachineHireInput, MachineDetailDto, MachineLineDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { formatDay } from '../ownership/wording';
import { Button } from '../ui/button';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  DeclaredWarning, describedField, field, Field, FormFooter, Refusal, todayIso, useDeclaredPeriods, useSave, Warning,
} from './FormParts';
import {
  fieldDays, fieldShillings, hireAmountPreview, oldHireChange, oldHireOpeningRate, overlapWarning, parseDays, parseRate,
  usualRateHint,
} from './forms';
import { daysText, oldHireNotice } from './wording';

const DAYS_HINT = 'In halves: 0.5 is a morning, 2.5 is two and a half days.';

/**
 * A hire to an outside client: log one, or correct one when `line` is given.
 * A hire is a one-off job. The client is charged the days times the daily
 * rate, and all of it goes into the machine's pot (R8): the job's income is
 * the machine's amount, so the hire leaves profit where it was.
 *
 * A hire recorded before that rule (no usual rate stored) keeps its charge and
 * its machine amount (R10). Its days and rate stay closed behind "Change days
 * or rate", and opening it shows what the change does before it is saved.
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
  const isOldHire = line !== undefined && line.standardRateCents === null;
  const [client, setClient] = useState(line?.customerName ?? '');
  const [phone, setPhone] = useState(line?.customerPhone ?? '');
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [startDate, setStartDate] = useState(() => line?.date ?? todayIso());
  const [days, setDays] = useState(line ? fieldDays(line.halfDays) : '');
  // A new hire starts at the machine's hire rate and a correction at the hire's own (KTD9);
  // an older hire's change starts from its charge over its days (R10).
  const [rate, setRate] = useState(() =>
    !line ? fieldShillings(m.hireRateCents) : isOldHire ? oldHireOpeningRate(line) : fieldShillings(line.rateCents),
  );
  const [figuresOpen, setFiguresOpen] = useState(!isOldHire);
  // A correction opens with every field filled, so what is wrong shows at once.
  const [tried, setTried] = useState(line !== undefined);
  const declared = useDeclaredPeriods(m.id);
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  const usualRateCents = line?.standardRateCents ?? m.hireRateCents;
  const daysRead = parseDays(days);
  const rateRead = parseRate(rate);

  const clientProblem = tried && client.trim() === '' ? 'Enter the client’s name.' : null;
  // Days are YYYY-MM-DD, which sort as text.
  const dateProblem =
    startDate === ''
      ? 'Choose the start date.'
      : startDate < m.startDay
        ? `This machine counts from ${formatDay(m.startDay)}. A hire before that day cannot be logged.`
        : null;
  const daysProblem = figuresOpen && (tried || days.trim() !== '') ? (daysRead.ok ? null : daysRead.reason) : null;
  const rateProblem = figuresOpen && (tried || rate.trim() !== '') ? (rateRead.ok ? null : rateRead.reason) : null;

  const preview = rateRead.ok ? hireAmountPreview(days, rateRead.cents) : null;
  const daysHint = preview ?? DAYS_HINT;
  const rateHint = usualRateHint(rateRead, usualRateCents);

  // What a correction sends about the figures (KTD10): nothing leaves them as
  // they are. An ordinary hire sends what was changed; an older one, once its
  // change is opened, sends both, as the server requires.
  const figures: Pick<EditMachineHireInput, 'halfDays' | 'rateCents'> = {};
  if (line && figuresOpen && daysRead.ok && rateRead.ok) {
    if (isOldHire || daysRead.halfDays !== line.halfDays) figures.halfDays = daysRead.halfDays;
    if (isOldHire || rateRead.cents !== line.rateCents) figures.rateCents = rateRead.cents;
  }
  const unchanged =
    line !== undefined &&
    client.trim() === (line.customerName ?? '') &&
    phone.trim() === (line.customerPhone ?? '') &&
    notes.trim() === (line.notes ?? '') &&
    startDate === line.date &&
    Object.keys(figures).length === 0;

  // KTD7: the days this hire would take, against the machine's other days and hires on the page.
  const halfDays = figuresOpen ? (daysRead.ok ? daysRead.halfDays : null) : line?.halfDays ?? null;
  const overlap = halfDays !== null && !dateProblem ? overlapWarning({ id: line?.id, date: startDate, halfDays }, m.lines) : null;

  const notice =
    line && isOldHire && figuresOpen && daysRead.ok && rateRead.ok
      ? oldHireNotice(oldHireChange(line, daysRead.halfDays, rateRead.cents))
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (client.trim() === '' || dateProblem || unchanged) return;
    const details = { customerName: client.trim(), customerPhone: phone.trim(), notes: notes.trim(), startDate };
    if (line) {
      if (figuresOpen && (!daysRead.ok || !rateRead.ok)) return;
      const input = { ...details, ...figures };
      void save(() => api.editMachineHire(line.id, input), 'Could not save the hire. Try again.');
      return;
    }
    if (!daysRead.ok || !rateRead.ok) return;
    const input = { ...details, halfDays: daysRead.halfDays, rateCents: rateRead.cents };
    void save(() => api.logMachineHire(m.id, input), 'Could not log the hire. Try again.');
  };

  const figureFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      <Field id={`${id}-rate`} label="Daily rate (KSh)" problem={rateProblem} hint={rateHint}>
        <input
          {...describedField(`${id}-rate`, rateProblem, rateHint)}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 3500"
          className={field}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </Field>
    </div>
  );

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{line ? 'Edit hire' : 'Log a hire'}</DialogTitle>
        <DialogDescription>
          {!line
            ? `The hire becomes a one-off job in Jobs & costs. The client is charged the days times the daily rate, and all of it goes into ${m.name}’s pot. Add the hire’s other costs to that job.`
            : isOldHire
              ? 'The hire’s one-off job in Jobs & costs changes with it.'
              : 'The hire’s one-off job in Jobs & costs changes with it. A change of days or rate changes what the client is charged and what goes into the pot alike.'}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-client`} label="Client" problem={clientProblem}>
          <input
            {...describedField(`${id}-client`, clientProblem)}
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder="e.g. Mwangi Hardware"
            className={field}
            value={client}
            onChange={(e) => setClient(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-phone`} label="Phone (optional)">
            <input
              id={`${id}-phone`}
              type="tel"
              autoComplete="off"
              maxLength={30}
              placeholder="e.g. 0722 000 111"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
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
        </div>

        {line && isOldHire && !figuresOpen ? (
          <div className="space-y-2 rounded-lg border border-line px-4 py-3 text-sm text-charcoal">
            <p>
              Recorded before hires were charged at the days times the daily rate: {daysText(line.halfDays)}, charged{' '}
              {money(line.chargedCents ?? 0)}, with {money(line.amountCents)} for the machine. These figures stay as they
              are unless you change the days or rate.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => setFiguresOpen(true)}>
              Change days or rate
            </Button>
          </div>
        ) : (
          figureFields
        )}

        {line && isOldHire && figuresOpen && (
          <div role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-charcoal">
            <p>
              This hire was recorded before hires were charged at the days times the daily rate. Saving charges the
              client the days times this rate, and all of it goes into the pot:
            </p>
            {notice ? (
              <ul className="list-disc space-y-0.5 pl-5">
                {notice.map((text) => <li key={text}>{text}</li>)}
              </ul>
            ) : (
              <p>Enter the days and a daily rate to see the new figures.</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setFiguresOpen(false)}>
              Keep the recorded figures
            </Button>
          </div>
        )}

        <Field id={`${id}-notes`} label="Notes (optional)">
          <textarea
            id={`${id}-notes`}
            rows={2}
            maxLength={1000}
            className={field}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Warning>{overlap}</Warning>
        <DeclaredWarning date={dateProblem ? '' : startDate} periods={declared.periods} failed={declared.failed} onRetry={declared.retry} />
      </DialogBody>

      {/* Not saved until the declared payouts have been checked, so the warning is seen first. */}
      <FormFooter saving={saving} disabled={unchanged || declared.checking} label={line ? 'Save' : 'Log hire'} />
    </form>
  );
}
