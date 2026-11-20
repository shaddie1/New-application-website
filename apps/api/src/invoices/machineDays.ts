/**
 * Machine days at an invoice's payment (owner, 20 November 2026): each project
 * lists the machines it uses and the half days each works per visit; when the
 * payment is recorded, the visits marked done in the invoice's period times
 * those half days are offered as each machine's days. Staff can change them
 * before saving. They go on the income job at the machine's project rate, so
 * they count as a cost and into the machine's pot, as days logged on the
 * Machines page do.
 */
import type { InvoiceMachineDaysDto } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { countsFromStartDay } from '../machines/pot.js';
import { dayText } from '../machines/rules.js';

/** A machine the project lists, as the suggestion reads it. */
export interface ListedMachine {
  assetId: string;
  name: string;
  halfDaysPerVisit: number;
  projectRateCents: number | null;
  countsFrom: Date | null;
  retiredAt: Date | null;
}

/** The days to suggest: machines on the register and not retired, done visits times half days per visit. */
export function suggestMachineDays(machines: ListedMachine[], doneVisits: number): InvoiceMachineDaysDto {
  return {
    doneVisits,
    suggestions: machines
      .filter((m) => m.projectRateCents !== null && m.countsFrom !== null && !m.retiredAt)
      .map((m) => ({
        assetId: m.assetId,
        name: m.name,
        rateCents: m.projectRateCents!,
        halfDaysPerVisit: m.halfDaysPerVisit,
        halfDays: doneVisits * m.halfDaysPerVisit,
      })),
  };
}

export async function machineDaysFor(projectId: string, periodStart: Date, periodEnd: Date): Promise<InvoiceMachineDaysDto> {
  const [listed, doneVisits] = await Promise.all([
    prisma.projectMachine.findMany({
      where: { projectId },
      select: {
        halfDaysPerVisit: true,
        asset: { select: { id: true, name: true, projectRateCents: true, countsFrom: true, retiredAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectVisit.count({ where: { projectId, status: 'DONE', date: { gte: periodStart, lte: periodEnd } } }),
  ]);
  return suggestMachineDays(
    listed.map((l) => ({ assetId: l.asset.id, ...l.asset, halfDaysPerVisit: l.halfDaysPerVisit })),
    doneVisits,
  );
}

/** A machine as the payment checks it. */
export interface MachineForDays {
  id: string;
  name: string;
  projectRateCents: number | null;
  countsFrom: Date | null;
  retiredAt: Date | null;
}

/** "2 days", "2.5 days", "half a day". */
export const daysText = (halfDays: number) =>
  halfDays === 1 ? 'half a day' : `${halfDays / 2} ${halfDays === 2 ? 'day' : 'days'}`;

/**
 * Why these machine days cannot go on a job dated `paidOn`, or null when they
 * can: each machine once, on the register, not retired, and counting from its
 * start day on, as on the Machines page.
 */
export function machineDaysRefusal(
  days: { assetId: string; halfDays: number }[],
  machines: MachineForDays[],
  paidOn: Date,
): string | null {
  const seen = new Set<string>();
  for (const d of days) {
    if (seen.has(d.assetId)) return 'Each machine can be listed once.';
    seen.add(d.assetId);
    const m = machines.find((x) => x.id === d.assetId);
    if (!m || m.projectRateCents === null || m.countsFrom === null) {
      return 'One of the machines is not on the machine register. Remove it from the list.';
    }
    if (m.retiredAt) return `${m.name} is retired, so it can't take new days. Set its days to 0.`;
    if (!countsFromStartDay(paidOn, m.countsFrom)) {
      return `${m.name}'s start day is ${dayText(m.countsFrom)}, after the day this was paid. Set its days to 0, or move its start day back first.`;
    }
  }
  return null;
}
