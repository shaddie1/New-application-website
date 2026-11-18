'use client';

import { useEffect, useId, useState } from 'react';
import type { MachineDetailDto } from '@onyxhawk/types';

import { api, type MachineAssetOption } from '../../lib/api';
import { money } from '../../lib/money';
import { SelectField } from '../ownership/SelectField';
import { formatDay } from '../ownership/wording';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { describedField, field, Field, FormFooter, Refusal, todayIso, useSave } from './FormParts';
import { fieldShillings, machineChanges, parsePrice, parseRate, startDayProblem } from './forms';
import { LoadFailed } from './MachineTable';

// The three forms for the machine itself: add one, put an asset that is
// already in the asset list on the register, and edit one. The rules are in
// `forms.ts`. Each is the inside of a dialog and is mounted afresh when it opens.

const START_DAY_HINT = 'Days and repairs before this day do not count.';
const RATE_HINT = 'Whole shillings. Each day the machine works puts this much in its pot.';

type Answer = { machine: MachineDetailDto };

/** A reason is shown once its field has something in it, or once Save has been pressed. */
const shownWhen = (tried: boolean) => (typed: string, problem: string | null) =>
  tried || typed.trim() !== '' ? problem : null;

/** Add a machine that is not in the asset list yet. It appears there too. */
export function AddMachineForm({ onAdded, onClose }: { onAdded: (machine: MachineDetailDto) => void; onClose: () => void }) {
  const id = useId();
  const today = todayIso();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [startDay, setStartDay] = useState(today);
  const [tried, setTried] = useState(false);
  const { saving, refusal, save } = useSave<Answer>((r) => { onClose(); onAdded(r.machine); });

  const priceRead = parsePrice(price);
  const rateRead = parseRate(rate);
  const shown = shownWhen(tried);
  const nameProblem = tried && name.trim() === '' ? 'Enter a name.' : null;
  const priceProblem = priceRead.ok ? null : priceRead.reason;
  const rateProblem = shown(rate, rateRead.ok ? null : rateRead.reason);
  const purchaseProblem = purchaseDate === '' ? 'Choose the purchase date.' : null;
  const startProblem = startDayProblem(startDay, today);
  const priceHint = 'Leave blank if it has no price. A machine with no price has no investors.';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (name.trim() === '' || !priceRead.ok || !rateRead.ok || purchaseProblem || startProblem) return;
    void save(
      () => api.addMachine({
        name: name.trim(),
        purchaseDate,
        priceCents: priceRead.cents,
        dailyRateCents: rateRead.cents,
        startDay,
      }),
      'Could not add the machine. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Add a machine</DialogTitle>
        <DialogDescription>
          The machine also appears in the asset list, under Company finance. Its investors are named after it is added.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-name`} label="Name" problem={nameProblem}>
          <input
            {...describedField(`${id}-name`, nameProblem)}
            type="text"
            autoComplete="off"
            maxLength={200}
            placeholder="e.g. Floor scrubber"
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-price`} label="Price (KSh)" problem={priceProblem} hint={priceHint}>
            <input
              {...describedField(`${id}-price`, priceProblem, priceHint)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 260000"
              className={field}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field id={`${id}-rate`} label="Daily rate (KSh)" problem={rateProblem} hint={RATE_HINT}>
            <input
              {...describedField(`${id}-rate`, rateProblem, RATE_HINT)}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 2000"
              className={field}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-bought`} label="Purchase date" problem={purchaseProblem}>
            <input
              {...describedField(`${id}-bought`, purchaseProblem)}
              type="date"
              className={field}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-start`} label="Start day" problem={startProblem} hint={START_DAY_HINT}>
            <input
              {...describedField(`${id}-start`, startProblem, START_DAY_HINT)}
              type="date"
              max={today}
              className={field}
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
            />
          </Field>
        </div>
      </DialogBody>

      <FormFooter saving={saving} label="Add machine" />
    </form>
  );
}

const categoryLabel = (category: string) => category.charAt(0) + category.slice(1).toLowerCase();

/** Put an asset that is already in the asset list on the register, by giving it a daily rate. */
export function GiveRateForm({ onAdded, onClose }: { onAdded: (machine: MachineDetailDto) => void; onClose: () => void }) {
  const id = useId();
  const today = todayIso();
  const [assets, setAssets] = useState<MachineAssetOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [assetId, setAssetId] = useState('');
  const [rate, setRate] = useState('');
  const [startDay, setStartDay] = useState(today);
  const [tried, setTried] = useState(false);
  const { saving, refusal, save } = useSave<Answer>((r) => { onClose(); onAdded(r.machine); });

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .machineAssets()
      .then((r) => { if (live) setAssets(r.assets); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  const asset = assets?.find((a) => a.id === assetId);
  const rateRead = parseRate(rate);
  const assetProblem = tried && !asset ? 'Choose an asset.' : null;
  const rateProblem = shownWhen(tried)(rate, rateRead.ok ? null : rateRead.reason);
  const startProblem = startDayProblem(startDay, today);
  const assetHint = asset
    ? `${asset.costCents > 0 ? `Its price is ${money(asset.costCents)}` : 'It has no price on record'}, bought ${formatDay(asset.purchaseDate)}.`
    : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!asset || !rateRead.ok || startProblem) return;
    void save(
      () => api.giveMachineRate(asset.id, { dailyRateCents: rateRead.cents, startDay }),
      'Could not put the asset on the register. Try again.',
    );
  };

  const header = (
    <DialogHeader>
      <DialogTitle>Give an existing asset a rate</DialogTitle>
      <DialogDescription>
        An asset from the asset list joins the Machines page once it has a daily rate. It stays in the asset list.
      </DialogDescription>
    </DialogHeader>
  );

  if (failed || !assets || assets.length === 0) {
    return (
      <>
        {header}
        <DialogBody>
          {failed ? (
            <LoadFailed what="the asset list" onRetry={() => setAttempt((a) => a + 1)} />
          ) : !assets ? (
            <p className="py-6 text-center text-sm text-charcoal-muted">Loading assets…</p>
          ) : (
            <p className="py-6 text-center text-sm text-charcoal-muted">
              Every asset in the asset list is already on the Machines page.
            </p>
          )}
        </DialogBody>
      </>
    );
  }

  return (
    <form className="contents" onSubmit={submit} noValidate>
      {header}

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-asset`} label="Asset" problem={assetProblem} hint={assetHint}>
          <SelectField
            {...describedField(`${id}-asset`, assetProblem, assetHint)}
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            <option value="">Choose an asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({categoryLabel(a.category)})</option>
            ))}
          </SelectField>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-rate`} label="Daily rate (KSh)" problem={rateProblem} hint={RATE_HINT}>
            <input
              {...describedField(`${id}-rate`, rateProblem, RATE_HINT)}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 2000"
              className={field}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-start`} label="Start day" problem={startProblem} hint={START_DAY_HINT}>
            <input
              {...describedField(`${id}-start`, startProblem, START_DAY_HINT)}
              type="date"
              max={today}
              className={field}
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
            />
          </Field>
        </div>
      </DialogBody>

      <FormFooter saving={saving} label="Put on the register" />
    </form>
  );
}

/** A machine's name, price, daily rate and start day. */
export function EditMachineForm({
  machine: m, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const today = todayIso();
  const [name, setName] = useState(m.name);
  const [price, setPrice] = useState(fieldShillings(m.priceCents));
  const [rate, setRate] = useState(fieldShillings(m.dailyRateCents));
  const [startDay, setStartDay] = useState(m.startDay);
  const { saving, refusal, save } = useSave<Answer>((r) => { onSaved(r.machine); onClose(); });

  // Once an investor has been paid, the price and the start day stay as they are (R7).
  const paid = m.payments.length > 0;
  const lockedHint = 'Cannot change while a payment to an investor is recorded. Delete the payments to change it.';

  const priceRead = parsePrice(price);
  const rateRead = parseRate(rate);
  const nameProblem = name.trim() === '' ? 'Enter a name.' : null;
  const priceProblem = priceRead.ok ? null : priceRead.reason;
  const rateProblem = rateRead.ok ? null : rateRead.reason;
  // A start day that was not touched is not judged again: it is not sent.
  const startProblem = startDay === m.startDay ? null : startDayProblem(startDay, today);
  const priceHint = paid ? lockedHint : 'Leave blank if it has no price.';
  const rateHint = 'Whole shillings. Days already logged keep the rate they were logged at.';
  const startHint = paid ? lockedHint : START_DAY_HINT;

  const changes =
    !nameProblem && priceRead.ok && rateRead.ok && !startProblem
      ? machineChanges(m, { name: name.trim(), priceCents: priceRead.cents, dailyRateCents: rateRead.cents, startDay })
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changes) return;
    void save(() => api.editMachine(m.id, changes), 'Could not save the machine. Try again.');
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Edit machine</DialogTitle>
        <DialogDescription>The asset list shows the same name and price.</DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <Field id={`${id}-name`} label="Name" problem={nameProblem}>
          <input
            {...describedField(`${id}-name`, nameProblem)}
            type="text"
            autoComplete="off"
            maxLength={200}
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-price`} label="Price (KSh)" problem={priceProblem} hint={priceHint}>
            <input
              {...describedField(`${id}-price`, priceProblem, priceHint)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={paid}
              className={field}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field id={`${id}-rate`} label="Daily rate (KSh)" problem={rateProblem} hint={rateHint}>
            <input
              {...describedField(`${id}-rate`, rateProblem, rateHint)}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={field}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-start`} label="Start day" problem={startProblem} hint={startHint}>
            <input
              {...describedField(`${id}-start`, startProblem, startHint)}
              type="date"
              max={today}
              disabled={paid}
              className={field}
              value={startDay}
              onChange={(e) => setStartDay(e.target.value)}
            />
          </Field>
        </div>
      </DialogBody>

      <FormFooter saving={saving} disabled={!changes} />
    </form>
  );
}
