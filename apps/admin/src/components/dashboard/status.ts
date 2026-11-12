import type { AdminStats } from '@onyxhawk/types';

/** True when nothing is awaiting payment, confirmed, in progress or waiting for a quote. */
export function noActiveJobs(stats: AdminStats): boolean {
  return stats.pendingPayment === 0 && stats.confirmed === 0 && stats.inProgress === 0 && stats.pendingQuotes === 0;
}
