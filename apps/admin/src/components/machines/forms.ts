import type {
  DeclaredPeriodDto, EditMachineInput, MachineInvestorDto, MachineLineDto, MachineRowDto, ReplaceMachineInvestorsInput,
} from '@onyxhawk/types';

import { money } from '../../lib/money';
import { formatPercentShort } from '../ownership/stakes';
import { formatDay } from '../ownership/wording';
import { daysText } from './wording';

/**
 * The rules of the owner's forms on the Machines page: reading what was typed,
 * the amount shown before saving, and the warnings. The forms draw what this
 * module decides. The server checks everything again and has the last word.
 *
 * Money is whole cents. A typed amount is read digit by digit, never
 * multiplied as a fraction, so "4.35" is 435 cents and not 434.99.
 */

// ── Typed amounts ───────────────────────────────────────────────────────────

export type CentsReading = { ok: true; cents: number } | { ok: false; reason: string };

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

const NEGATIVE = /^-\d+(\.\d*)?$/;
const PLAIN_NUMBER = /^(\d+)(?:\.(\d*))?$/;

/** Which rate a field holds, as its messages name it. */
export type RateName = 'daily rate' | 'project rate' | 'hire rate';

/**
 * A daily rate: whole shillings, above zero. "2000" is 200,000 cents. Whole
 * shillings keep half a day's amount a whole number of cents. `rate` names the
 * field in what is wrong, so a machine's two rates each say which one it is.
 */
export function parseRate(text: string, rate: RateName = 'daily rate'): CentsReading {
  const typed = text.trim();
  if (typed === '') return refuse(`Enter a ${rate}.`);
  if (NEGATIVE.test(typed)) return refuse(`A ${rate} cannot be negative.`);
  const match = PLAIN_NUMBER.exec(typed);
  if (!match) return refuse('Enter a number, such as 2000.');
  if (match[2] !== undefined) return refuse(`A ${rate} is in whole shillings, with no cents.`);
  const cents = Number(match[1]) * 100;
  if (cents === 0) return refuse(`A ${rate} must be more than KSh 0.`);
  return { ok: true, cents };
}

/** Shillings, with cents when typed. Zero is the caller's to judge. */
function readAmount(text: string): CentsReading {
  const typed = text.trim();
  if (typed === '') return refuse('Enter an amount.');
  if (NEGATIVE.test(typed)) return refuse('An amount cannot be negative.');
  const match = PLAIN_NUMBER.exec(typed);
  if (!match) return refuse('Enter a number, such as 1500 or 1500.50.');
  const decimals = match[2] ?? '';
  if (decimals.length > 2) return refuse('An amount can have at most two decimal places.');
  return { ok: true, cents: Number(match[1]) * 100 + Number(decimals.padEnd(2, '0')) };
}

/**
 * An amount of money: "1234.56" is 123,456 cents. What an investor put in and
 * a payment must be above zero. A repair's cost and what a hire's customer
 * was charged may be nothing, with `orZero`: a repair under warranty, a hire
 * given free.
 */
export function parseAmount(text: string, { orZero = false }: { orZero?: boolean } = {}): CentsReading {
  const reading = readAmount(text);
  if (reading.ok && reading.cents === 0 && !orZero) return refuse('The amount must be more than KSh 0.');
  return reading;
}

/** A machine's price. Left blank, or 0, the machine has no price: it is then the company's alone. */
export function parsePrice(text: string): CentsReading {
  if (text.trim() === '') return { ok: true, cents: 0 };
  return readAmount(text);
}

/** A payment to an investor: above zero, and never more than they are still owed. */
export function parsePayment(text: string, owedCents: number): CentsReading {
  const reading = parseAmount(text);
  if (reading.ok && reading.cents > owedCents) return refuse(`That is more than the ${money(owedCents)} still owed.`);
  return reading;
}

/** What a money field starts with: 200,000 cents is "2000", 150,050 is "1500.50", and nothing is a blank. */
export function fieldShillings(cents: number): string {
  if (cents === 0) return '';
  const whole = Math.trunc(cents / 100);
  const hundredths = cents % 100;
  return hundredths === 0 ? String(whole) : `${whole}.${String(hundredths).padStart(2, '0')}`;
}

// ── Typed days ──────────────────────────────────────────────────────────────

export type DaysReading = { ok: true; halfDays: number } | { ok: false; reason: string };

/** Days, in halves: "2.5" is 5 half days. A quarter day is refused as typed, never rounded. */
export function parseDays(text: string): DaysReading {
  const typed = text.trim();
  if (typed === '') return refuse('Enter the days.');
  if (NEGATIVE.test(typed)) return refuse('Days cannot be negative.');
  const match = PLAIN_NUMBER.exec(typed);
  if (!match) return refuse('Enter a number, such as 1, 2.5 or 0.5.');
  const decimals = (match[2] ?? '').replace(/0+$/, '');
  if (decimals !== '' && decimals !== '5') return refuse('Days are counted in halves, such as 2 or 2.5.');
  const halfDays = Number(match[1]) * 2 + (decimals === '5' ? 1 : 0);
  if (halfDays === 0) return refuse('Days must be more than 0.');
  return { ok: true, halfDays };
}

/** What a days field starts with: 5 half days is "2.5". */
export function fieldDays(halfDays: number): string {
  return String(halfDays / 2);
}

// ── The amount shown before saving ──────────────────────────────────────────

/** Days x the daily rate. A rate is whole shillings, so half a day is a whole number of cents. */
export function daysAmountCents(halfDays: number, rateCents: number): number {
  return (halfDays * rateCents) / 2;
}

/**
 * Under a days field: what those days come to at `rateCents`, the amount that
 * leaves the job's profit and goes into the pot. Null while the days cannot
 * be read.
 */
export function amountPreview(days: string, rateCents: number): string | null {
  const reading = parseDays(days);
  if (!reading.ok) return null;
  return `${daysText(reading.halfDays)} at ${money(rateCents)} a day: ${money(daysAmountCents(reading.halfDays, rateCents))}`;
}

/**
 * R8: under a hire's days, what it comes to at `rateCents`. The client is
 * charged exactly that, and all of it goes to the machine's pot. Null while
 * the days cannot be read.
 */
export function hireAmountPreview(days: string, rateCents: number): string | null {
  const preview = amountPreview(days, rateCents);
  return preview && `${preview}. The client is charged this, and all of it goes into the pot.`;
}

/**
 * R7: under a record's rate, the usual rate it is stored beside. A record whose
 * rate differs from it shows both, so the hint says so as soon as the typed
 * rate differs.
 */
export function usualRateHint(typed: CentsReading, usualRateCents: number): string {
  const usual = `Usual rate ${money(usualRateCents)}`;
  return typed.ok && typed.cents !== usualRateCents ? `${usual}. This rate is different, so the record will show both.` : usual;
}

// ── An older hire's change of days or rate (R10) ────────────────────────────

type OldHire = Pick<MachineLineDto, 'chargedCents' | 'amountCents' | 'halfDays'>;

/**
 * What the rate starts as when the owner opens "Change days or rate" on a hire
 * recorded before hires were charged at days x rate: the charge over the days,
 * so the client's charge stays as it was. Blank when that is not whole
 * shillings above zero, since a rate must be.
 */
export function oldHireOpeningRate({ chargedCents, halfDays }: OldHire): string {
  const twiceCharged = (chargedCents ?? 0) * 2;
  if (twiceCharged % halfDays !== 0) return '';
  const rateCents = twiceCharged / halfDays;
  return rateCents > 0 && rateCents % 100 === 0 ? fieldShillings(rateCents) : '';
}

export type HireFigures = { chargedCents: number; machineCents: number; profitCents: number };

/**
 * R10: what the change of an older hire's days or rate does to it. Before, it
 * keeps its recorded charge and machine amount; after, it is charged days x the
 * rate and all of it is the machine's, so the job makes nothing on the hire.
 * The job's profit here is the charge less this machine's amount, before any
 * other cost on the job.
 */
export function oldHireChange(hire: OldHire, halfDays: number, rateCents: number): { before: HireFigures; after: HireFigures } {
  const charged = hire.chargedCents ?? 0;
  const amount = daysAmountCents(halfDays, rateCents);
  return {
    before: { chargedCents: charged, machineCents: hire.amountCents, profitCents: charged - hire.amountCents },
    after: { chargedCents: amount, machineCents: amount, profitCents: 0 },
  };
}

// ── Warnings: the owner can still save ──────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * KTD7: the half days a record takes on each date it covers. It starts on its
 * date and takes the following dates its days need; every date is whole but
 * the last of an odd number of half days, which takes one half.
 */
function halvesByDate(date: string, halfDays: number): Map<string, number> {
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(y!, m! - 1, d!);
  const count = Math.ceil(halfDays / 2);
  const halves = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const day = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    halves.set(day, i === count - 1 && halfDays % 2 === 1 ? 1 : 2);
  }
  return halves;
}

/** A record of the machine's use as the overlap check reads it: a line already on the page. */
export type UsageRecord = Pick<MachineLineDto, 'id' | 'isHire' | 'date' | 'halfDays' | 'jobTitle' | 'customerName'>;

/** A record as the overlap warning names it. */
function usageName(r: UsageRecord): string {
  if (!r.isHire) return `${daysText(r.halfDays)} on “${r.jobTitle}”, dated ${formatDay(r.date)}`;
  const dates = [...halvesByDate(r.date, r.halfDays).keys()];
  const last = dates[dates.length - 1]!;
  const when = last === r.date ? `on ${formatDay(r.date)}` : `${formatDay(r.date)} to ${formatDay(last)}`;
  return r.customerName ? `the hire to ${r.customerName}, ${when}` : `a hire, ${when}`;
}

/**
 * R13 and KTD7: the machine's other days and hires that the record being typed
 * shares a date with, worked out from the lines already on the page. Two half
 * days on one date fit; anything more on a shared date overlaps. The record
 * being edited, `record.id`, is not checked against itself. Null when nothing
 * overlaps or no date is chosen. Saving still works.
 */
export function overlapWarning(
  record: { id?: string; date: string; halfDays: number },
  lines: readonly UsageRecord[],
): string | null {
  if (record.date === '') return null;
  const mine = halvesByDate(record.date, record.halfDays);
  const overlapping = lines.filter((other) => {
    if (other.id === record.id) return false;
    return [...halvesByDate(other.date, other.halfDays)].some(([day, halves]) => mine.has(day) && halves + mine.get(day)! > 2);
  });
  if (overlapping.length === 0) return null;
  const names = overlapping.map(usageName);
  const named = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `These dates overlap ${named}. You can still save.`;
}

/**
 * R4: a hire rate below the project rate. A machine usually earns more hired
 * out on its own than on the company's jobs, so this is more often a slip than
 * a choice. Null at the project rate or above it.
 */
export function hireRateWarning(projectRateCents: number, hireRateCents: number): string | null {
  return hireRateCents < projectRateCents ? 'Hire rate is usually higher than the project rate — continue?' : null;
}

/**
 * Days or a hire dated inside a period whose payout is already declared: that
 * payout was worked out before this amount came off the profit. Names every
 * payout the date is inside. Dates are YYYY-MM-DD, which sort as text.
 */
export function declaredPeriodWarning(date: string, periods: DeclaredPeriodDto[]): string | null {
  if (date === '') return null;
  const labels = periods.filter((p) => p.periodStart <= date && date <= p.periodEnd).map((p) => `“${p.label}”`);
  if (labels.length === 0) return null;
  if (labels.length === 1) {
    return (
      `The payout ${labels[0]} is already declared, on the higher profit: this amount had not come off it. ` +
      'You can still save. The declared payout does not change.'
    );
  }
  const named = `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return (
    `The payouts ${named} are already declared, on the higher profit: this amount had not come off them. ` +
    'You can still save. The declared payouts do not change.'
  );
}

// ── The machine's own fields ────────────────────────────────────────────────

/**
 * The calendar day `now` falls on in Nairobi, YYYY-MM-DD. The server counts
 * "today" there when it refuses a start day in the future, so the forms do
 * too, wherever the owner's device thinks it is.
 */
export function nairobiDay(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

/**
 * Why a start day cannot be used, or null. `today` is YYYY-MM-DD. Jobs and
 * repairs dated before the start day do not count, so it can be set earlier
 * than today but never later.
 */
export function startDayProblem(day: string, today: string): string | null {
  if (day === '') return 'Choose a start day.';
  if (day > today) return 'The start day cannot be in the future.';
  return null;
}

type MachineFields = Pick<MachineRowDto, 'name' | 'priceCents' | 'projectRateCents' | 'hireRateCents' | 'startDay'>;

/**
 * What an edit changes, and only that: the server refuses a price or a start
 * day sent for a machine whose investor has been paid, so a field left alone
 * is not sent. Null when nothing was changed.
 *
 * R3: a machine whose hire rate is not reviewed can be saved with nothing
 * changed, because the form shows both rates and saving it is how the owner
 * says the hire rate is right as it stands. Every save then sends the marker
 * and both rates as the form shows them, so what is stored is what was seen,
 * even on a machine that has no hire rate stored and shows its project rate.
 */
export function machineChanges(
  machine: MachineFields & Pick<MachineRowDto, 'hireRateReviewed'>,
  typed: MachineFields,
): EditMachineInput | null {
  const changes: EditMachineInput = {};
  if (typed.name !== machine.name) changes.name = typed.name;
  if (typed.priceCents !== machine.priceCents) changes.priceCents = typed.priceCents;
  if (typed.startDay !== machine.startDay) changes.startDay = typed.startDay;
  if (!machine.hireRateReviewed) {
    return { ...changes, projectRateCents: typed.projectRateCents, hireRateCents: typed.hireRateCents, ratesReviewed: true };
  }
  if (typed.projectRateCents !== machine.projectRateCents) changes.projectRateCents = typed.projectRateCents;
  if (typed.hireRateCents !== machine.hireRateCents) changes.hireRateCents = typed.hireRateCents;
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * KTD6: whether the register came from an API that knows a machine's two
 * rates. The back-office and the API go live separately; an older API sends
 * only the one daily rate and would drop a rate typed in the new forms, so the
 * page offers no form until this holds. An empty register has nothing to tell
 * the two apart by, and passes.
 */
export function registerHasTwoRates(register: { machines: readonly object[] }): boolean {
  // Typed loosely on purpose: what is checked is a register that may predate `MachineRowDto`.
  return register.machines.every((m) => typeof (m as { projectRateCents?: unknown }).projectRateCents === 'number');
}

// ── Investors ───────────────────────────────────────────────────────────────

/** One row of the investors form. Everything typed is kept as typed. */
export type InvestorRow = {
  /** Stable for the life of the form: the investor's id, or a made-up key for a new row. */
  key: string;
  name: string;
  /** What they put in, as typed, in shillings. */
  amount: string;
};

/** The rows the form opens with: one per investor, at what each put in. */
export function investorRowsFor(investors: Pick<MachineInvestorDto, 'id' | 'name' | 'contributionCents'>[]): InvestorRow[] {
  return investors.map((i) => ({ key: i.id, name: i.name, amount: fieldShillings(i.contributionCents) }));
}

export function blankInvestorRow(key: string): InvestorRow {
  return { key, name: '', amount: '' };
}

/** A part of the price as a share, in hundredths of a percent, rounded down as the server does. `priceCents` is above zero. */
function shareBps(partCents: number, priceCents: number): number {
  return Math.floor((partCents * 10_000) / priceCents);
}

export type InvestorsForm = {
  /** By row key; a row with nothing wrong has no entry. */
  problems: Record<string, { name?: string; amount?: string }>;
  /** By row key: that amount as a share of the price, such as "60%". No entry while the amount cannot be read. */
  shares: Record<string, string>;
  /** The sum of the amounts that can be read. */
  totalCents: number;
  /** What is left for the company. Null when the amounts pass the price. */
  companyLine: string | null;
  /** Shown before saving, when the machine has already earned (R28). The owner can still save. */
  warning: string | null;
  /** Why the form cannot be saved, or null when it can. */
  blockedReason: string | null;
  /** The request to send. Null exactly when `blockedReason` is set. */
  input: ReplaceMachineInvestorsInput | null;
};

/**
 * Judges the investors form as it stands. It can be saved only when every row
 * has a name and an amount, the amounts together are no more than the price,
 * and something has changed. No rows at all is allowed: the machine is then
 * the company's alone.
 */
export function readInvestorsForm(
  machine: Pick<MachineRowDto, 'priceCents' | 'earnedCents'> & {
    investors: Pick<MachineInvestorDto, 'name' | 'contributionCents'>[];
  },
  rows: InvestorRow[],
): InvestorsForm {
  const { priceCents } = machine;
  const hasPrice = priceCents > 0;

  const problems: InvestorsForm['problems'] = {};
  const shares: InvestorsForm['shares'] = {};
  const investors: ReplaceMachineInvestorsInput['investors'] = [];
  let totalCents = 0;
  for (const row of rows) {
    const found: { name?: string; amount?: string } = {};
    const name = row.name.trim();
    if (name === '') found.name = 'Enter a name.';
    const reading = parseAmount(row.amount);
    if (reading.ok) {
      totalCents += reading.cents;
      if (hasPrice) shares[row.key] = formatPercentShort(shareBps(reading.cents, priceCents));
      if (name !== '') investors.push({ name, contributionCents: reading.cents });
    } else {
      found.amount = reading.reason;
    }
    if (found.name || found.amount) problems[row.key] = found;
  }

  const leftCents = priceCents - totalCents;
  let companyLine: string | null = null;
  if (rows.length === 0) companyLine = 'With no investors the machine is the company’s alone.';
  else if (leftCents === 0) companyLine = 'The investors cover the whole price. The company has no share.';
  else if (leftCents > 0 && hasPrice) {
    companyLine = `The company keeps the other ${formatPercentShort(shareBps(leftCents, priceCents))} (${money(leftCents)} of the price).`;
  }

  const changed =
    investors.length !== machine.investors.length ||
    investors.some((typed, i) => {
      const stored = machine.investors[i]!;
      return typed.name !== stored.name || typed.contributionCents !== stored.contributionCents;
    });

  let blockedReason: string | null = null;
  if (Object.keys(problems).length > 0) blockedReason = 'Correct the rows marked above.';
  else if (rows.length > 0 && !hasPrice) blockedReason = 'A machine with no price has no investors. Give it a price first.';
  else if (leftCents < 0) {
    blockedReason =
      `The investors’ amounts come to ${money(totalCents)}, which is ${money(-leftCents)} more than the price (${money(priceCents)}).`;
  } else if (!changed) blockedReason = 'No changes to save.';

  const warning =
    blockedReason === null && machine.earnedCents > 0
      ? `This machine has already earned ${money(machine.earnedCents)}. The new shares apply to all of it, not only to what it earns from now on.`
      : null;

  return {
    problems,
    shares,
    totalCents,
    companyLine,
    warning,
    blockedReason,
    input: blockedReason === null ? { investors } : null,
  };
}
