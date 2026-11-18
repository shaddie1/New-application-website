/**
 * Estimate engine — a pure function from (site survey, rates, costing) to a
 * priced estimate with its expected profit. No I/O, no dates, no randomness,
 * so it is unit-testable and the same inputs always give the same figures.
 *
 * Implements the OnyxHawk_Quotation_Calculator.xlsx pipeline step for step,
 * plus the costing questionnaire:
 *
 *   Lines      area: m² ÷ m²/person-hour × soil multiplier; item: qty × min ÷ 60
 *   Labour     movement allowance is HOURS (pct of task hours); set-up and
 *              close-out once per visit; job days from the largest crew, then
 *              cleaners per day from the job days. The costing can set crew,
 *              job days and supervisor days by hand; empty follows the survey
 *   Cost       cleaner pay + supervisor pay + consumables + extra materials +
 *              transport (per job day) + equipment wear (pct of pay) + lunch
 *              (per person per job day) + machine wear (per job day used) +
 *              machine hire (per visit) + upfront purchases (in full on a
 *              one-off, spread over a recurring contract's visits) = direct
 *              cost; contingency on direct cost gives the cost base
 *   Price      minimum = base ÷ (1 − min margin), target = base ÷ (1 − target
 *              margin); recommended = round-up(max(target, market low));
 *              recommended per visit = round-up(max(minimum, recommended ×
 *              (1 − discount))). The price quoted is the client's when one is
 *              entered (per visit, or per month ÷ visits), else the recommended
 *   Check      gross margin at quote = 1 − cost base ÷ price per visit
 *              (deliberate deviation from the sheet, which divides the direct
 *              cost: contingency is an expected cost, so the margin shown and
 *              graded is the one after it). A client's price below the minimum
 *              grades BELOW MINIMUM; it is shown, never blocked
 *   Profit     price − cost base per visit; per month and for the contract
 *              when it has a length
 *   Legal      compliant-pay row: cleaners at the legal minimum wage with
 *              contingency, no supervisor, no equipment wear — informational,
 *              matches the sheet's own comparison row, never blocks a quote
 *   Commission max(0, price − direct cost) × commission pct, trainee-sourced only
 *
 * Called without a costing, there is no lunch and nothing from the
 * questionnaire, so the figures are the sheet's alone. Money is in integer
 * cents; hours are rounded to 2 dp in the output.
 */
import type {
  EstimateCostingInput,
  EstimateLine,
  EstimateMachineLine,
  MarginCheck,
  QuoteEstimateOutput,
  QuoteRates,
  QuoteSurveyInput,
} from '@onyxhawk/types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const sum = (amounts: { amountCents: number }[] = []) => amounts.reduce((a, x) => a + x.amountCents, 0);

/** Round cents up to the next multiple of `roundToKes` shillings. */
export function roundUpToKes(cents: number, roundToKes: number): number {
  const step = Math.max(1, Math.round(roundToKes)) * 100;
  return Math.ceil(cents / step) * step;
}

export function computeEstimate(
  survey: QuoteSurveyInput,
  rates: QuoteRates,
  costing?: EstimateCostingInput,
): QuoteEstimateOutput {
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
  // A crew set by hand prices a quote that has no survey.
  const crewSetByHand = costing?.crewSize != null || costing?.jobDays != null;
  if (taskHours === 0 && !crewSetByHand) warnings.push('Nothing to price yet — add at least one area or item to the survey.');

  // ── Labour build-up ───────────────────────────────────────────────────────
  const movementAllowanceHours = taskHours * rates.movementAllowancePct;
  const totalPersonHours = taskHours + movementAllowanceHours + rates.setupCloseOutHours;
  if (!(survey.workingWindowHours > 0)) warnings.push('No working window given — assumed a full productive day.');
  const hoursPerPersonPerDay = Math.min(
    survey.workingWindowHours > 0 ? survey.workingWindowHours : rates.productiveHoursPerPersonPerDay,
    rates.productiveHoursPerPersonPerDay,
  );
  const surveyJobDays = Math.max(1, Math.ceil(totalPersonHours / (rates.largestCrewPerJobDay * hoursPerPersonPerDay)));
  const surveyCrewSize = Math.ceil(totalPersonHours / (surveyJobDays * hoursPerPersonPerDay));
  const surveySupervisorDays = survey.supervisorOnSite ? surveyJobDays : 0;
  if (surveyJobDays > 1) {
    warnings.push(`Needs more than the largest crew can do in a day — the job runs over ${surveyJobDays} days per visit.`);
  }

  // What is charged: the costing's figure where one was set, else the survey's.
  const jobDays = costing?.jobDays ?? surveyJobDays;
  const crewSize = costing?.crewSize ?? surveyCrewSize;
  const supervisorDays = costing?.supervisorDays ?? (survey.supervisorOnSite ? jobDays : 0);
  const dayRates = {
    cleanerPayPerDayCents: costing?.cleanerPayPerDayCents ?? rates.cleanerPayPerDayCents,
    supervisorPayPerDayCents: costing?.supervisorPayPerDayCents ?? rates.supervisorPayPerDayCents,
    lunchPerPersonPerDayCents: costing ? (costing.lunchPerPersonPerDayCents ?? rates.lunchPerPersonPerDayCents) : 0,
    transportPerDayCents: costing?.transportPerDayCents ?? rates.transportByZoneCents[survey.distanceZone],
  };

  const frequency = rates.frequencyTable.find((f) => f.label === survey.frequencyLabel);
  if (!frequency) warnings.push(`Frequency “${survey.frequencyLabel}” is not on the rates card — priced as one-off.`);
  const visitsPerMonth = frequency?.visitsPerMonth ?? 1;
  const discountPct = frequency?.discountPct ?? 0;

  // Blank contract length means a one-off, whatever the visits per month.
  const contractMonths = costing?.contractMonths || null;
  if (costing && !contractMonths && (visitsPerMonth > 1 || (costing.requestFrequency ?? 'NONE') !== 'NONE')) {
    warnings.push(
      'The work repeats but has no contract length — costed as a one-off: upfront purchases are charged in full ' +
        'to one visit and no monthly or contract profit is shown.',
    );
  }

  // ── Machines ──────────────────────────────────────────────────────────────
  // Wear per job day: cost less salvage (never below 0), over the life in
  // months and the working days in a month. Charged even past the life's end.
  const wearPerDay = (costCents: number, salvageCents: number, lifeMonths: number) =>
    Math.max(0, costCents - salvageCents) / lifeMonths / rates.workingDaysPerMonth;
  const machines: EstimateMachineLine[] = [];

  for (const m of costing?.ownedMachines ?? []) {
    const { asset } = m;
    let perDay: number;
    if (asset.usefulLifeMonths && asset.usefulLifeMonths > 0) {
      perDay = wearPerDay(asset.costCents, asset.salvageValueCents, asset.usefulLifeMonths);
      if (m.wearPerDayCents != null) {
        warnings.push(`“${asset.name}” now has a useful life in the asset register — its wear is worked out from that, not the figure typed.`);
      }
    } else {
      perDay = m.wearPerDayCents ?? 0;
      if (m.wearPerDayCents == null) warnings.push(`“${asset.name}” has no useful life and no wear typed — it was charged nothing.`);
    }
    if (asset.deleted) warnings.push(`“${asset.name}” has been deleted from the asset register — costed from its last saved figures.`);
    else if (asset.retired) warnings.push(`“${asset.name}” is retired in the asset register.`);
    const days = m.daysUsed ?? jobDays;
    machines.push({ kind: 'OWNED', name: asset.name, perJobDayCents: perDay, daysUsed: days, cents: perDay * days });
  }
  for (const m of costing?.boughtMachines ?? []) {
    const perDay = wearPerDay(m.priceCents, 0, m.lifeMonths);
    const days = m.daysUsed ?? jobDays;
    machines.push({ kind: 'BOUGHT', name: m.name, perJobDayCents: perDay, daysUsed: days, cents: perDay * days });
  }
  for (const m of costing?.hiredMachines ?? []) {
    machines.push({ kind: 'HIRED', name: m.name, perJobDayCents: null, daysUsed: null, cents: m.hirePerVisitCents });
  }

  // ── Direct cost per visit ─────────────────────────────────────────────────
  const labourCents = crewSize * jobDays * dayRates.cleanerPayPerDayCents;
  const supervisorCents = supervisorDays * dayRates.supervisorPayPerDayCents;
  const consumablesCents = lines.reduce((a, l) => a + l.consumablesCents, 0);
  const extraMaterialsCents = sum(costing?.extraMaterials);
  const transportCents = dayRates.transportPerDayCents * jobDays;
  const equipmentWearCents = (labourCents + supervisorCents) * rates.equipmentWearPct;
  const lunchCents = (crewSize * jobDays + supervisorDays) * dayRates.lunchPerPersonPerDayCents;
  const machineWearCents = machines.filter((m) => m.kind !== 'HIRED').reduce((a, m) => a + m.cents, 0);
  const machineHireCents = machines.filter((m) => m.kind === 'HIRED').reduce((a, m) => a + m.cents, 0);
  const upfrontTotalCents = sum(costing?.upfrontPurchases);
  const upfrontCents = contractMonths ? upfrontTotalCents / (contractMonths * visitsPerMonth) : upfrontTotalCents;
  const directCostCents =
    labourCents + supervisorCents + consumablesCents + extraMaterialsCents + transportCents + equipmentWearCents +
    lunchCents + machineWearCents + machineHireCents + upfrontCents;
  const contingencyCents = directCostCents * rates.contingencyPct;
  const costBaseCents = directCostCents + contingencyCents;

  // ── Price build-up ────────────────────────────────────────────────────────
  const minimumPriceCents = costBaseCents / (1 - rates.minimumMarginPct);
  const targetPriceCents = costBaseCents / (1 - rates.targetMarginPct);
  const marketLowCents = lines.reduce((a, l) => a + l.marketLowCents, 0);
  const marketHighCents = lines.reduce((a, l) => a + l.marketHighCents, 0); // reporting only
  const recommendedPriceCents = roundUpToKes(Math.max(targetPriceCents, marketLowCents), rates.roundToKes);
  const recommendedPerVisitCents = roundUpToKes(
    Math.max(minimumPriceCents, recommendedPriceCents * (1 - discountPct)),
    rates.roundToKes,
  );

  // The price quoted: the client's when entered, else the recommended. A
  // monthly price stays exact and the price per visit follows from it.
  const clientPriceCents = costing?.clientPriceCents ?? null;
  const clientPriceBasis = clientPriceCents == null ? null : (costing?.clientPriceBasis ?? 'VISIT');
  const pricePerVisitCents =
    clientPriceCents == null ? recommendedPerVisitCents
    : clientPriceBasis === 'MONTH' ? clientPriceCents / visitsPerMonth
    : clientPriceCents;
  const monthlyValueCents = clientPriceBasis === 'MONTH' ? clientPriceCents! : pricePerVisitCents * visitsPerMonth;
  const visitsAtEntry = costing?.clientPriceVisitsPerMonth;
  if (clientPriceBasis === 'MONTH' && visitsAtEntry != null && visitsAtEntry !== visitsPerMonth) {
    warnings.push(
      `The monthly price was entered at ${visitsAtEntry} visits a month and the survey now has ${visitsPerMonth} — ` +
        'the monthly price is kept, so the price per visit changed.',
    );
  }

  // ── Checks ────────────────────────────────────────────────────────────────
  // A zero price has no margin to check; treat it as below minimum.
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
  const meetsLegalMinimum = dayRates.cleanerPayPerDayCents >= rates.legalMinWagePerDayCents;
  if (!meetsLegalMinimum) {
    warnings.push(
      `Cleaner pay KSh ${(dayRates.cleanerPayPerDayCents / 100).toLocaleString('en-KE')}/day is below the legal minimum ` +
        `KSh ${(rates.legalMinWagePerDayCents / 100).toLocaleString('en-KE')}/day; at compliant pay the margin would be ` +
        `${Math.round(legalMarginPct * 100)}% (informational — not priced in).`,
    );
  }

  // ── Commission ────────────────────────────────────────────────────────────
  const netProfitPerVisitCents = pricePerVisitCents - directCostCents;
  const commissionCents = survey.traineeSourced ? Math.max(0, netProfitPerVisitCents) * rates.commissionPct : 0;

  // ── Expected profit ───────────────────────────────────────────────────────
  const profitPerMonthCents = contractMonths ? monthlyValueCents - costBaseCents * visitsPerMonth : null;

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
      surveyJobDays,
      surveyCrewSize,
      surveySupervisorDays,
    },
    dayRates,
    machines: machines.map((m) => ({
      ...m,
      perJobDayCents: m.perJobDayCents == null ? null : c(m.perJobDayCents),
      cents: c(m.cents),
    })),
    costs: {
      labourCents: c(labourCents),
      supervisorCents: c(supervisorCents),
      consumablesCents: c(consumablesCents),
      extraMaterialsCents: c(extraMaterialsCents),
      transportCents: c(transportCents),
      equipmentWearCents: c(equipmentWearCents),
      lunchCents: c(lunchCents),
      machineWearCents: c(machineWearCents),
      machineHireCents: c(machineHireCents),
      upfrontCents: c(upfrontCents),
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
      recommendedPerVisitCents,
      clientPriceCents,
      clientPriceBasis,
      pricePerVisitCents: c(pricePerVisitCents),
      monthlyValueCents: c(monthlyValueCents),
      marginPct: r4(grossMarginAtQuote),
      marginCheck,
    },
    profit: {
      perVisitCents: c(pricePerVisitCents - costBaseCents),
      contractMonths,
      perMonthCents: profitPerMonthCents == null ? null : c(profitPerMonthCents),
      perContractCents: profitPerMonthCents == null ? null : c(profitPerMonthCents * contractMonths!),
    },
    commission: {
      traineeSourced: survey.traineeSourced,
      commissionPct: rates.commissionPct,
      netProfitPerVisitCents: c(netProfitPerVisitCents),
      commissionCents: c(commissionCents),
    },
    compliance: {
      cleanerPayPerDayCents: dayRates.cleanerPayPerDayCents,
      legalMinWagePerDayCents: rates.legalMinWagePerDayCents,
      meetsLegalMinimum,
      legalDirectCostCents: c(legalDirectCostCents),
      legalMarginPct: r4(legalMarginPct),
    },
    warnings,
  };
}
