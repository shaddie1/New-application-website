import type { MachineInvestorDto, MachineLineDto, MachinePotDto, MachineRowDto } from '@onyxhawk/types';

import { money } from '../../lib/money';
import { formatPercentShort } from '../ownership/stakes';

/**
 * The words on the Machines page that depend on the figures. Amounts show
 * their cents when they have any: an investor is paid to the cent.
 */

/**
 * How far a machine is from earning back its price plus repairs. Whether it
 * has paid for itself is the server's answer, so this page and the server
 * cannot disagree about it.
 */
export function earnBackLine({ earnBackGapCents, paidForItself }: Pick<MachinePotDto, 'earnBackGapCents' | 'paidForItself'>): string {
  if (paidForItself) {
    return earnBackGapCents < 0 ? `Paid for itself, ${money(-earnBackGapCents)} ahead` : 'Paid for itself';
  }
  if (earnBackGapCents > 0) return `${money(earnBackGapCents)} still to earn back`;
  // No price, no repairs and nothing earned: "KSh 0 still to earn back" would say nothing.
  return 'Nothing to earn back yet';
}

/** Who owns a machine: the company, or each investor with their share and the company with what is left. */
export function ownedBy({
  investors, companyShareBps,
}: {
  investors: Pick<MachineInvestorDto, 'name' | 'shareBps'>[];
  companyShareBps: MachineRowDto['companyShareBps'];
}): string {
  if (investors.length === 0) return 'The company';
  return [
    ...investors.map((investor) => `${investor.name} ${formatPercentShort(investor.shareBps)}`),
    ...(companyShareBps > 0 ? [`the company ${formatPercentShort(companyShareBps)}`] : []),
  ].join(', ');
}

/**
 * Under a machine's investors: the share of the price no investor covered and
 * the company's part of what the machine has earned less its repairs. Null
 * when investors cover the whole price.
 */
export function companyPartLine({
  companyShareBps, companyPartCents,
}: Pick<MachinePotDto, 'companyShareBps' | 'companyPartCents'>): string | null {
  if (companyShareBps <= 0) return null;
  return `The company holds ${formatPercentShort(companyShareBps)}. Its part, ${entitledText(companyPartCents)}, stays in the pot.`;
}

/**
 * What an investor can still be paid. One paid more than they are entitled to
 * reads as overpaid by the difference, never as a negative amount still owed.
 */
export function stillOwedText({ owedCents, overpaidCents }: Pick<MachineInvestorDto, 'owedCents' | 'overpaidCents'>): string {
  return overpaidCents > 0 ? `Overpaid by ${money(overpaidCents)}` : money(owedCents);
}

/**
 * A share of what the machine has earned less its repairs. When repairs have
 * outrun earnings the share is below zero; nobody is entitled to a negative
 * amount, so it reads KSh 0 and the pot says how far short it is.
 */
export function entitledText(entitledCents: number): string {
  return money(Math.max(entitledCents, 0));
}

/** What is in the pot. Below zero it is worded, so the shortfall never rests on a minus sign or a colour. */
export function potText(potCents: number): string {
  return potCents < 0 ? `Short by ${money(-potCents)}` : money(potCents);
}

/** A machine's price. The server sends 0 for a machine with no price, which is a dash here and not KSh 0. */
export function priceText(priceCents: number): string {
  return priceCents > 0 ? money(priceCents) : '—';
}

/** Half days as days: 5 is "2.5 days". */
export function daysText(halfDays: number): string {
  return halfDays === 2 ? '1 day' : `${halfDays / 2} days`;
}

/**
 * What a hire's customer was charged, and how far under the machine's rate
 * when it was: the machine still got its full rate. Null for days on a job.
 */
export function hireChargeText({ chargedCents, amountCents }: Pick<MachineLineDto, 'chargedCents' | 'amountCents'>): string | null {
  if (chargedCents === null) return null;
  const charged = `Charged ${money(chargedCents)}`;
  return chargedCents < amountCents ? `${charged}, ${money(amountCents - chargedCents)} under the rate` : charged;
}

/** A hire, with its customer when the server sent the name. It sends it to the owner only. */
export function hireLabel({ customerName }: Pick<MachineLineDto, 'customerName'>): string {
  return customerName ? `Hire to ${customerName}` : 'Hire';
}

/**
 * What the page says before a hire is removed. Removing a hire deletes its
 * one-off job, and every other machine's days on that job go with it, so the
 * message names each of those machines, its days and the amount that leaves
 * its pot. The lines are separated by line breaks.
 */
export function removeHireMessage({
  chargedCents, amountCents, otherMachines = [],
}: Pick<MachineLineDto, 'chargedCents' | 'amountCents' | 'otherMachines'>): string {
  const hire =
    `The hire’s one-off job in Jobs & costs is deleted with it: its income of ${money(chargedCents ?? 0)} ` +
    `and any costs logged on that job. ${money(amountCents)} leaves the pot.`;
  const last = 'This cannot be undone.';
  if (otherMachines.length === 0) return `${hire} ${last}`;
  return [
    hire,
    '',
    'The days logged on that job for other machines are removed too. Each amount leaves that machine’s pot:',
    ...otherMachines.map((other) => `${other.machineName}, ${daysText(other.halfDays)}: ${money(other.amountCents)}`),
    '',
    last,
  ].join('\n');
}
