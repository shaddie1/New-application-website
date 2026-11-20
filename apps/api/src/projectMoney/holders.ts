/**
 * Each shareholder on one project: what they paid in towards its costs, and
 * their part of its profit so far at today's stake, after 5% for marketing
 * (finance/split.ts). Pay-ins stay in the company as their investment; they
 * are not paid back out of the profit (owner, 20 November 2026).
 */
import { marketingSetAsideCents, splitByStake } from '../finance/split.js';

export interface Holder {
  id: string;
  name: string;
  basisPoints: number;
}

export interface PaidIn {
  shareholderId: string;
  name: string;
  amountCents: number;
}

export interface ProjectHolders {
  marketingCents: number;
  sharedCents: number;
  unallocatedCents: number;
  paidInCents: number;
  holders: { shareholderId: string; name: string; basisPoints: number; paidInCents: number; profitShareCents: number }[];
}

/**
 * `holders` are today's cap table, in its order. A former holder who paid in
 * comes after them with no stake and no share of the profit, so what they put
 * in still shows.
 */
export function projectHoldersOf(profitCents: number, holders: Holder[], paidIn: PaidIn[]): ProjectHolders {
  const marketingCents = marketingSetAsideCents(profitCents);
  const sharedCents = profitCents - marketingCents;
  const split = splitByStake(sharedCents, holders.map((h) => h.basisPoints));

  const paidBy = new Map<string, { name: string; cents: number }>();
  for (const p of paidIn) {
    const prev = paidBy.get(p.shareholderId);
    paidBy.set(p.shareholderId, { name: prev?.name ?? p.name, cents: (prev?.cents ?? 0) + p.amountCents });
  }

  const rows = holders.map((h, i) => ({
    shareholderId: h.id,
    name: h.name,
    basisPoints: h.basisPoints,
    paidInCents: paidBy.get(h.id)?.cents ?? 0,
    profitShareCents: split.shares[i]!,
  }));
  const current = new Set(holders.map((h) => h.id));
  for (const [shareholderId, p] of paidBy) {
    if (!current.has(shareholderId)) {
      rows.push({ shareholderId, name: p.name, basisPoints: 0, paidInCents: p.cents, profitShareCents: 0 });
    }
  }

  return {
    marketingCents,
    sharedCents,
    unallocatedCents: split.unallocatedCents,
    paidInCents: paidIn.reduce((acc, p) => acc + p.amountCents, 0),
    holders: rows,
  };
}
