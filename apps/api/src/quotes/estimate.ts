/**
 * Estimate engine — a pure function from (site survey, rates) to a priced
 * estimate. No I/O, no dates, no randomness, so it is unit-testable and the
 * same inputs always give the same figures.
 *
 * Implements the OnyxHawk_Quotation_Calculator.xlsx pipeline step for step:
 *
 *   Lines      area: m² ÷ m²/person-hour × soil multiplier; item: qty × min ÷ 60
 *   Labour     movement allowance is HOURS (pct of task hours); set-up and
 *              close-out once per visit; job days from the largest crew, then
 *              cleaners per day from the job days
 *   Cost       cleaner pay + supervisor pay + consumables + transport (per
 *              job day) + equipment wear (pct of pay) = direct cost;
 *              contingency on direct cost gives the cost base
 *   Price      minimum = base ÷ (1 − min margin), target = base ÷ (1 − target
 *              margin); recommended = round-up(max(target, market low));
 *              per visit = round-up(max(minimum, recommended × (1 − discount)))
 *   Check      gross margin at quote = 1 − cost base ÷ price per visit
 *              (deliberate deviation from the sheet, which divides the direct
 *              cost: contingency is an expected cost, so the margin shown and
 *              graded is the one after it. Because the price is floored at the
 *              minimum, BELOW MINIMUM can only occur at a zero price.)
 *   Legal      compliant-pay row: cleaners at the legal minimum wage with
 *              contingency, no supervisor, no equipment wear — informational,
 *              matches the sheet's own comparison row, never blocks a quote
 *   Commission (price − direct cost) × commission pct, trainee-sourced only
 *
 * Money is in integer cents; hours are rounded to 2 dp in the output.
 */
import type {
  EstimateLine,
  MarginCheck,
  QuoteEstimateOutput,
  QuoteRates,
  QuoteSurveyInput,
} from '@onyxhawk/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Round cents up to the next multiple of `roundToKes` shillings. */
export function roundUpToKes(cents: number, roundToKes: number): number {
  const step = Math.max(1, Math.round(roundToKes)) * 100;
  return Math.ceil(cents / step) * step;
}

export function computeEstimate(survey: QuoteSurveyInput, rates: QuoteRates): QuoteEstimateOutput {
  const warnings: string[] = [];
  const soilMultiplier = rates.soilMultiplier[survey.soilLevel];

  // ── Per-area and per-item lines ───────────────────────────────────────────
  const lines: EstimateLine[] = [];

  for (const area of survey.areas) {
    const rate = rates.areaRates.find((r) => r.areaType === area.areaType && r.cleanLevel === area.cleanLevel);
    const m2PerRoom =
      area.sizePreset === 'MEASURED' ? Math.max(0, area.measuredM2 ?? 0) : rates.roomSizePresetsM2[area.sizePreset];
    const m2 = area.roomCount * m2PerRoom;
    const levelLabel = area.cleanLevel === 'VACUUM_ONLY' ? 'Vacuum only' : area.cleanLevel === 'DEEP' ? 'Deep' : 'Routine';
    const detail = `${area.roomCount} × ${r2(m2PerRoom)} m² · ${levelLabel}`;

    if (!rate) {
      warnings.push(`No rate for “${area.areaType}” (${levelLabel}) — that area was priced at zero.`);
      lines.push({ kind: 'AREA', label: area.areaType, detail, quantity: area.roomCount, units: m2, personHours: 0,
        consumablesCents: 0, marketLowCents: 0, marketHighCents: 0 });
      continue;
    }
    if (area.sizePreset === 'MEASURED' && !(area.measuredM2 && area.measuredM2 > 0)) {
      warnings.push(`“${area.areaType}” is marked as measured but has no m² — it contributes nothing.`);
    }
    lines.push({
      kind: 'AREA',
      label: area.areaType,
      detail,
      quantity: area.roomCount,
      units: m2,
      personHours: (m2 / rate.m2PerPersonHour) * soilMultiplier,
      consumablesCents: m2 * rate.consumablesPerM2Cents,
      marketLowCents: m2 * rate.marketLowPerM2Cents,
      marketHighCents: m2 * rate.marketHighPerM2Cents,
    });
  }

  for (const item of survey.items) {
    const rate = rates.itemRates.find((r) => r.itemType === item.itemType);
    const detail = `${item.quantity} unit${item.quantity === 1 ? '' : 's'}`;
    if (!rate) {
      warnings.push(`No rate for item “${item.itemType}” — it was priced at zero.`);
      lines.push({ kind: 'ITEM', label: item.itemType, detail, quantity: item.quantity, units: item.quantity,
        personHours: 0, consumablesCents: 0, marketLowCents: 0, marketHighCents: 0 });
      continue;
    }
    lines.push({
      kind: 'ITEM',
      label: item.itemType,
      detail,
      quantity: item.quantity,
      units: item.quantity,
      personHours: (item.quantity * rate.minutesPerUnit) / 60,
      consumablesCents: item.quantity * rate.consumablesPerUnitCents,
      marketLowCents: item.quantity * rate.marketLowPerUnitCents,
      marketHighCents: item.quantity * rate.marketHighPerUnitCents,
    });
  }

  const areaTaskHours = lines.filter((l) => l.kind === 'AREA').reduce((a, l) => a + l.personHours, 0);
  const itemTaskHours = lines.filter((l) => l.kind === 'ITEM').reduce((a, l) => a + l.personHours, 0);
  const taskHours = areaTaskHours + itemTaskHours;
  if (taskHours === 0) warnings.push('Nothing to price yet — add at least one area or item to the survey.');

  // ── Labour build-up ───────────────────────────────────────────────────────
  const movementAllowanceHours = taskHours * rates.movementAllowancePct;
  const totalPersonHours = taskHours + movementAllowanceHours + rates.setupCloseOutHours;
  if (!(survey.workingWindowHours > 0)) warnings.push('No working window given — assumed a full productive day.');
  const hoursPerPersonPerDay = Math.min(
    survey.workingWindowHours > 0 ? survey.workingWindowHours : rates.productiveHoursPerPersonPerDay,
    rates.productiveHoursPerPersonPerDay,
  );
  const jobDays = Math.max(1, Math.ceil(totalPersonHours / (rates.largestCrewPerJobDay * hoursPerPersonPerDay)));
  const crewSize = Math.ceil(totalPersonHours / (jobDays * hoursPerPersonPerDay));
  const supervisorDays = survey.supervisorOnSite ? jobDays : 0;
  if (jobDays > 1) {
    warnings.push(`Needs more than the largest crew can do in a day — the job runs over ${jobDays} days per visit.`);
  }

  // ── Direct cost per visit ─────────────────────────────────────────────────
  const labourCents = crewSize * jobDays * rates.cleanerPayPerDayCents;
  const supervisorCents = supervisorDays * rates.supervisorPayPerDayCents;
  const consumablesCents = lines.reduce((a, l) => a + l.consumablesCents, 0);
  const transportCents = rates.transportByZoneCents[survey.distanceZone] * jobDays;
  const equipmentWearCents = (labourCents + supervisorCents) * rates.equipmentWearPct;
  const directCostCents = labourCents + supervisorCents + consumablesCents + transportCents + equipmentWearCents;
  const contingencyCents = directCostCents * rates.contingencyPct;
  const costBaseCents = directCostCents + contingencyCents;

  // ── Price build-up ────────────────────────────────────────────────────────
  const minimumPriceCents = costBaseCents / (1 - rates.minimumMarginPct);
  const targetPriceCents = costBaseCents / (1 - rates.targetMarginPct);
  const marketLowCents = lines.reduce((a, l) => a + l.marketLowCents, 0);
  const marketHighCents = lines.reduce((a, l) => a + l.marketHighCents, 0); // reporting only
  const recommendedPriceCents = roundUpToKes(Math.max(targetPriceCents, marketLowCents), rates.roundToKes);

  const frequency = rates.frequencyTable.find((f) => f.label === survey.frequencyLabel);
  if (!frequency) warnings.push(`Frequency “${survey.frequencyLabel}” is not on the rates card — priced as one-off.`);
  const visitsPerMonth = frequency?.visitsPerMonth ?? 1;
  const discountPct = frequency?.discountPct ?? 0;

  const pricePerVisitCents = roundUpToKes(
    Math.max(minimumPriceCents, recommendedPriceCents * (1 - discountPct)),
    rates.roundToKes,
  );
  const monthlyValueCents = pricePerVisitCents * visitsPerMonth;

  // ── Checks ────────────────────────────────────────────────────────────────
  // A zero price (nothing surveyed) has no margin to check; treat it as blocked.
  const grossMarginAtQuote = pricePerVisitCents > 0 ? 1 - costBaseCents / pricePerVisitCents : 0;
  const marginCheck: MarginCheck =
    pricePerVisitCents <= 0 ? 'BELOW MINIMUM'
    : grossMarginAtQuote >= rates.targetMarginPct ? 'OK'
    : grossMarginAtQuote >= rates.minimumMarginPct ? 'BELOW TARGET'
    : 'BELOW MINIMUM';

  // ── Legal-minimum / compliant-pay check (informational) ───────────────────
  // Mirrors the sheet's comparison row: cleaners at the legal minimum with
  // contingency on labour, no supervisor pay, no equipment wear.
  const legalDirectCostCents =
    crewSize * jobDays * rates.legalMinWagePerDayCents * (1 + rates.contingencyPct) + consumablesCents + transportCents;
  const legalMarginPct = pricePerVisitCents > 0 ? 1 - legalDirectCostCents / pricePerVisitCents : 0;
  const meetsLegalMinimum = rates.cleanerPayPerDayCents >= rates.legalMinWagePerDayCents;
  if (!meetsLegalMinimum) {
    warnings.push(
      `Cleaner pay KSh ${(rates.cleanerPayPerDayCents / 100).toLocaleString('en-KE')}/day is below the legal minimum ` +
        `KSh ${(rates.legalMinWagePerDayCents / 100).toLocaleString('en-KE')}/day; at compliant pay the margin would be ` +
        `${Math.round(legalMarginPct * 100)}% (informational — not priced in).`,
    );
  }

  // ── Commission ────────────────────────────────────────────────────────────
  const netProfitPerVisitCents = pricePerVisitCents - directCostCents;
  const commissionCents = survey.traineeSourced ? netProfitPerVisitCents * rates.commissionPct : 0;

  const c = (n: number) => Math.round(n);
  return {
    lines: lines.map((l) => ({
      ...l,
      units: r2(l.units),
      personHours: r2(l.personHours),
      consumablesCents: c(l.consumablesCents),
      marketLowCents: c(l.marketLowCents),
      marketHighCents: c(l.marketHighCents),
    })),
    hours: {
      areaTaskHours: r2(areaTaskHours),
      itemTaskHours: r2(itemTaskHours),
      taskHours: r2(taskHours),
      soilMultiplier,
      movementAllowanceHours: r2(movementAllowanceHours),
      setupCloseOutHours: rates.setupCloseOutHours,
      totalPersonHours: r2(totalPersonHours),
      hoursPerPersonPerDay: r2(hoursPerPersonPerDay),
      jobDays,
      crewSize,
      supervisorDays,
    },
    costs: {
      labourCents: c(labourCents),
      supervisorCents: c(supervisorCents),
      consumablesCents: c(consumablesCents),
      transportCents: c(transportCents),
      equipmentWearCents: c(equipmentWearCents),
      directCostCents: c(directCostCents),
      contingencyCents: c(contingencyCents),
      costBaseCents: c(costBaseCents),
    },
    pricing: {
      minimumPriceCents: c(minimumPriceCents),
      targetPriceCents: c(targetPriceCents),
      marketLowCents: c(marketLowCents),
      marketHighCents: c(marketHighCents),
      recommendedPriceCents,
      frequencyLabel: frequency?.label ?? survey.frequencyLabel,
      visitsPerMonth,
      discountPct,
      pricePerVisitCents,
      monthlyValueCents,
      marginPct: r4(grossMarginAtQuote),
      marginCheck,
    },
    commission: {
      traineeSourced: survey.traineeSourced,
      commissionPct: rates.commissionPct,
      netProfitPerVisitCents: c(netProfitPerVisitCents),
      commissionCents: c(commissionCents),
    },
    compliance: {
      cleanerPayPerDayCents: rates.cleanerPayPerDayCents,
      legalMinWagePerDayCents: rates.legalMinWagePerDayCents,
      meetsLegalMinimum,
      legalDirectCostCents: c(legalDirectCostCents),
      legalMarginPct: r4(legalMarginPct),
    },
    warnings,
  };
}
