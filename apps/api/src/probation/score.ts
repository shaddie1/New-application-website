/**
 * KPI scoring — the workbook's own formula, as pure functions.
 *
 *   perKpiScore  = Σtargets == 0
 *                    ? (Σactuals > 0 ? weight : 0)
 *                    : weight × min(1, Σactuals ÷ Σtargets)
 *   weightedScore = Σ perKpiScore ÷ Σ weight
 *   outcome       = criticalBreach ? Not confirmed
 *                 : weightedScore ≥ 0.70 ? Confirm
 *                 : weightedScore ≥ 0.55 ? Extend 1 month
 *                 : Not confirmed
 *
 * Sums run over every month present, so adding a month row (an extension)
 * changes nothing here.
 */
import type { ProbationDecision } from '@onyxhawk/types';

export interface KpiInput {
  weight: number;
  targets: Record<string, number>;
  actuals: Record<string, number>;
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function kpiScore(kpi: KpiInput): { sumTargets: number; sumActuals: number; score: number } {
  const sumTargets = sum(kpi.targets);
  const sumActuals = sum(kpi.actuals);
  const score = sumTargets === 0 ? (sumActuals > 0 ? kpi.weight : 0) : kpi.weight * Math.min(1, sumActuals / sumTargets);
  return { sumTargets: r4(sumTargets), sumActuals: r4(sumActuals), score: r4(score) };
}

export function weightedScore(kpis: KpiInput[]): number {
  const totalWeight = kpis.reduce((a, k) => a + k.weight, 0);
  if (totalWeight === 0) return 0;
  return r4(kpis.reduce((a, k) => a + kpiScore(k).score, 0) / totalWeight);
}

export function probationOutcome(score: number, criticalBreach: boolean): ProbationDecision {
  if (criticalBreach) return 'NOT_CONFIRMED';
  if (score >= 0.7) return 'CONFIRM';
  if (score >= 0.55) return 'EXTEND_ONE_MONTH';
  return 'NOT_CONFIRMED';
}
