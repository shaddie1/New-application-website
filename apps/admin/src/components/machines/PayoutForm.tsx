'use client';

import { useId, useState } from 'react';
import type { MachineDetailDto, MachineInvestorDto } from '@onyxhawk/types';

import { api } from '../../lib/api';
import { money } from '../../lib/money';
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { describedField, field, Field, FormFooter, Refusal, todayIso, useSave } from './FormParts';
import { parsePayment } from './forms';

/**
 * A payment to an investor from the machine's pot. Offered only while the
 * investor is owed something, and never for more than that.
 */
export function PayoutForm({
  machine: m, investor, onSaved, onClose,
}: {
  machine: MachineDetailDto;
  investor: MachineInvestorDto;
  onSaved: (machine: MachineDetailDto) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(todayIso);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [tried, setTried] = useState(false);
  const { saving, refusal, save } = useSave<{ machine: MachineDetailDto }>((r) => { onSaved(r.machine); onClose(); });

  const amountRead = parsePayment(amount, investor.owedCents);
  const dateProblem = date === '' ? 'Choose the date.' : null;
  const amountProblem = tried || amount.trim() !== '' ? (amountRead.ok ? null : amountRead.reason) : null;
  const amountHint = `${money(investor.owedCents)} is still owed. A payment cannot be more than that.`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (dateProblem || !amountRead.ok) return;
    void save(
      () => api.payMachineInvestor(m.id, {
        investorId: investor.id,
        date,
        amountCents: amountRead.cents,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      }),
      'Could not record the payment. Try again.',
    );
  };

  return (
    <form className="contents" onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Pay {investor.name}</DialogTitle>
        <DialogDescription>
          From {m.name}’s pot. While a payment is recorded, the machine’s price, investors and start day cannot
          be changed.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Refusal>{refusal}</Refusal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${id}-date`} label="Date" problem={dateProblem}>
            <input
              {...describedField(`${id}-date`, dateProblem)}
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id={`${id}-amount`} label="Amount (KSh)" problem={amountProblem} hint={amountHint}>
            <input
              {...describedField(`${id}-amount`, amountProblem, amountHint)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={field}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
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

      <FormFooter saving={saving} label="Record payment" />
    </form>
  );
}
