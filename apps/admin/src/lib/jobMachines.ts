import type { JobDto } from '@onyxhawk/types';

import { daysText } from '../components/machines/wording';
import { money } from './money';

/**
 * What Jobs & costs asks before a job is deleted. Deleting a job removes the
 * machine days logged on it, and each machine's pot goes down by that amount,
 * so the question names every machine, its days and the amount. A job with no
 * machine days is asked about as it always was.
 */
export function deleteJobMessage(job: Pick<JobDto, 'title' | 'machineLines'>): string {
  const question = `Delete "${job.title}" and all its expenses?`;
  const lines = job.machineLines ?? [];
  if (lines.length === 0) return question;
  return [
    question,
    '',
    "The machine days logged on it will be removed too. Each amount leaves that machine's pot:",
    ...lines.map(
      (line) => `${line.machineName}, ${daysText(line.halfDays)}${line.isHire ? ' on hire' : ''}: ${money(line.amountCents)}`,
    ),
  ].join('\n');
}
