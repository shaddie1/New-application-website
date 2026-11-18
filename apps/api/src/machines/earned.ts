/**
 * What a machine earned, split into days on the company's own jobs and days
 * hired out to a client. It reads the same lines machines/pot.ts adds up, so
 * the two parts always add up to what the pot counts as earned. Nothing here
 * feeds the pot, payback or any investor figure (KTD8).
 *
 * A pure function over rows the caller has already loaded. Money is whole cents.
 */
import type { MachineEarnedSplitDto } from '@onyxhawk/types';

import { sum } from './pot.js';

export type EarnedLine = { halfDays: number; amountCents: number; isHire: boolean };

export function earnedSplit(lines: EarnedLine[]): MachineEarnedSplitDto {
  const project = lines.filter((l) => !l.isHire);
  const hire = lines.filter((l) => l.isHire);
  return {
    projectHalfDays: sum(project.map((l) => l.halfDays)),
    projectCents: sum(project.map((l) => l.amountCents)),
    hireHalfDays: sum(hire.map((l) => l.halfDays)),
    hireCents: sum(hire.map((l) => l.amountCents)),
  };
}
