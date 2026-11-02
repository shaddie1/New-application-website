import { describe, expect, it } from 'vitest';
import type { EstimateCostingInput, OwnedMachineCopy, QuoteRates, QuoteSurveyInput } from '@onyxhawk/types';

import { computeEstimate, roundUpToKes } from './estimate.js';
import { DEFAULT_RATES } from './rates.js';

/**
 * Worked example against the seeded rates card, following the sheet:
 *   4 medium office rooms, routine   → 80 m² ÷ 250 × 1.0 = 0.32 h,  consumables 80 × 1.00
 *   2 small washrooms, deep          → 20 m² ÷ 15  × 1.0 = 1.33 h,  consumables 20 × 6.00
 *   10 waste bins                    → 10 × 1 min ÷ 60   = 0.17 h,  consumables 10 × 3.00
 *   task 1.82 h + movement 15% (0.273 h) + set-up 1 h = 3.093 person-hours
 *   → 1 job day, 1 cleaner. Zone 1, normal soil, one-off.
 */
const survey: QuoteSurveyInput = {
  distanceZone: 'ZONE1',
  soilLevel: 'NORMAL',
  frequencyLabel: 'One-off',
  workingWindowHours: 7,
  supervisorOnSite: false,
  traineeSourced: false,
  areas: [
    { areaType: 'Office room', cleanLevel: 'ROUTINE', roomCount: 4, sizePreset: 'MEDIUM' },
    { areaType: 'Washroom incl. toilets and sinks', cleanLevel: 'DEEP', roomCount: 2, sizePreset: 'SMALL' },
  ],
  items: [{ itemType: 'Waste bin: empty and reline', quantity: 10 }],
};

describe('roundUpToKes', () => {
  it('rounds cents up to the next multiple of the step in shillings', () => {
    expect(roundUpToKes(344_142.86, 500)).toBe(350_000);
    expect(roundUpToKes(350_000, 500)).toBe(350_000);
    expect(roundUpToKes(350_001, 500)).toBe(400_000);
    expect(roundUpToKes(0, 500)).toBe(0);
  });
});

describe('computeEstimate', () => {
  it('builds per-area and per-item lines, with soil applied to areas only', () => {
    const out = computeEstimate(survey, DEFAULT_RATES);

    expect(out.lines).toHaveLength(3);
    expect(out.lines[0]).toMatchObject({ kind: 'AREA', units: 80, personHours: 0.32, consumablesCents: 8_000, marketLowCents: 304_000, marketHighCents: 400_000 });
    expect(out.lines[1]).toMatchObject({ kind: 'AREA', units: 20, personHours: 1.33, consumablesCents: 12_000, marketLowCents: 100_000, marketHighCents: 300_000 });
    expect(out.lines[2]).toMatchObject({ kind: 'ITEM', units: 10, personHours: 0.17, consumablesCents: 3_000, marketLowCents: 0 });

    expect(out.hours.areaTaskHours).toBe(1.65);
    expect(out.hours.itemTaskHours).toBe(0.17);
    expect(out.hours.taskHours).toBe(1.82);

    const heavy = computeEstimate({ ...survey, soilLevel: 'HEAVY' }, DEFAULT_RATES);
    expect(heavy.hours.areaTaskHours).toBe(2.15); // 1.6533 × 1.3
    expect(heavy.hours.itemTaskHours).toBe(0.17); // items are not soil-adjusted
  });

  it('adds movement allowance as hours and set-up once per visit, then sizes the crew', () => {
    const { hours } = computeEstimate(survey, DEFAULT_RATES);
    expect(hours.movementAllowanceHours).toBe(0.27); // 15% of 1.82
    expect(hours.setupCloseOutHours).toBe(1);
    expect(hours.totalPersonHours).toBe(3.09);
    expect(hours.hoursPerPersonPerDay).toBe(7);
    expect(hours.jobDays).toBe(1); // ceil(3.09 ÷ (6 × 7))
    expect(hours.crewSize).toBe(1); // ceil(3.09 ÷ (1 × 7))
    expect(hours.supervisorDays).toBe(0);
  });

  it('builds direct cost, contingency and the cost base', () => {
    const { costs } = computeEstimate(survey, DEFAULT_RATES);
    expect(costs.labourCents).toBe(80_000); // 1 × 1 × KSh 800
    expect(costs.supervisorCents).toBe(0);
    expect(costs.consumablesCents).toBe(23_000);
    expect(costs.transportCents).toBe(100_000); // zone 1 × 1 day
    expect(costs.equipmentWearCents).toBe(4_000); // 5% of pay
    expect(costs.directCostCents).toBe(207_000);
    expect(costs.contingencyCents).toBe(20_700); // 10% of direct
    expect(costs.costBaseCents).toBe(227_700);
  });

  it('prices from the cost base and the market low, rounded up to KSh 500', () => {
    const { pricing } = computeEstimate(survey, DEFAULT_RATES);
    expect(pricing.minimumPriceCents).toBe(325_286); // 227,700 ÷ 0.7, unrounded
    expect(pricing.targetPriceCents).toBe(379_500); // 227,700 ÷ 0.6
    expect(pricing.marketLowCents).toBe(404_000);
    expect(pricing.marketHighCents).toBe(700_000);
    expect(pricing.recommendedPriceCents).toBe(450_000); // round-up(max(3,795, 4,040))
    expect(pricing.visitsPerMonth).toBe(1);
    expect(pricing.discountPct).toBe(0);
    expect(pricing.pricePerVisitCents).toBe(450_000);
    expect(pricing.monthlyValueCents).toBe(450_000);
    expect(pricing.marginPct).toBe(0.494); // 1 − 227,700 ÷ 450,000
    expect(pricing.marginCheck).toBe('OK');
  });

  it('applies the frequency discount per visit, never below the minimum price', () => {
    const weekly = computeEstimate({ ...survey, frequencyLabel: 'Weekly (4 visits)' }, DEFAULT_RATES).pricing;
    expect(weekly.pricePerVisitCents).toBe(400_000); // 4,500 × 0.85 = 3,825 → 4,000
    expect(weekly.monthlyValueCents).toBe(1_600_000);
    expect(weekly.marginCheck).toBe('OK'); // 1 − 2,277 ÷ 4,000 = 43%

    const rates: QuoteRates = {
      ...DEFAULT_RATES,
      frequencyTable: [{ label: 'Half price', visitsPerMonth: 22, discountPct: 0.5 }],
    };
    const half = computeEstimate({ ...survey, frequencyLabel: 'Half price' }, rates).pricing;
    expect(half.pricePerVisitCents).toBe(350_000); // max(3,252.86, 2,250) → 3,500
    expect(half.monthlyValueCents).toBe(7_700_000);
    expect(half.marginCheck).toBe('BELOW TARGET'); // 1 − 2,277 ÷ 3,500 = 35%
  });

  it('grades the margin at quote on the cost base (contingency included)', () => {
    // At the floor price the margin only just clears the minimum, so a deep
    // discount lands between minimum and target — never below minimum.
    const rates: QuoteRates = {
      ...DEFAULT_RATES,
      frequencyTable: [{ label: 'Half price', visitsPerMonth: 22, discountPct: 0.5 }],
    };
    const { pricing } = computeEstimate({ ...survey, frequencyLabel: 'Half price' }, rates);
    expect(pricing.minimumPriceCents).toBe(325_286); // 227,700 ÷ 0.7
    expect(pricing.pricePerVisitCents).toBe(350_000);
    expect(pricing.marginPct).toBe(0.3494); // 1 − 227,700 ÷ 350,000
    expect(pricing.marginCheck).toBe('BELOW TARGET');
  });

  it('never prices below the minimum, so the margin check clears minimum by construction', () => {
    // pricePerVisit = round-up(max(minimum, …)) and minimum = base ÷ (1 − min
    // margin) with base ≥ direct cost, so gross margin ≥ minimum margin for
    // any real survey. Even an empty survey is priced: set-up alone costs a
    // job day of labour and transport.
    const empty = computeEstimate({ ...survey, areas: [], items: [] }, DEFAULT_RATES);
    expect(empty.hours.totalPersonHours).toBe(1);
    expect(empty.pricing.pricePerVisitCents).toBe(350_000);
    expect(empty.pricing.marginCheck).toBe('OK');
    expect(empty.warnings.some((w) => w.startsWith('Nothing to price'))).toBe(true);
  });

  it('flags BELOW MINIMUM only when there is nothing to sell at all', () => {
    // Job days are floored at 1, so transport alone gives a price; only a
    // zero-cost card and an empty survey reach a zero price.
    const out = computeEstimate(
      { ...survey, areas: [], items: [] },
      { ...DEFAULT_RATES, setupCloseOutHours: 0, transportByZoneCents: { ZONE1: 0, ZONE2: 0, ZONE3: 0 } },
    );
    expect(out.pricing.pricePerVisitCents).toBe(0);
    expect(out.pricing.marginCheck).toBe('BELOW MINIMUM');
  });

  it('pays commission on price minus direct cost, trainee-sourced only', () => {
    expect(computeEstimate(survey, DEFAULT_RATES).commission.commissionCents).toBe(0);

    const trainee = computeEstimate({ ...survey, traineeSourced: true }, DEFAULT_RATES).commission;
    expect(trainee.netProfitPerVisitCents).toBe(243_000); // 450,000 − 207,000
    expect(trainee.commissionCents).toBe(12_150); // 5%
  });

  it('spreads a big job over days from the largest crew, then sizes the daily crew', () => {
    const big: QuoteSurveyInput = {
      ...survey,
      supervisorOnSite: true,
      areas: [{ areaType: 'Office room', cleanLevel: 'DEEP', roomCount: 30, sizePreset: 'VERY_LARGE' }],
      items: [],
    };
    const out = computeEstimate(big, DEFAULT_RATES);
    expect(out.hours.taskHours).toBe(48); // 2,400 m² ÷ 50
    expect(out.hours.totalPersonHours).toBe(56.2); // + 7.2 movement + 1 set-up
    expect(out.hours.jobDays).toBe(2); // ceil(56.2 ÷ (6 × 7))
    expect(out.hours.crewSize).toBe(5); // ceil(56.2 ÷ (2 × 7))
    expect(out.hours.supervisorDays).toBe(2);
    expect(out.costs.labourCents).toBe(5 * 2 * 80_000);
    expect(out.costs.supervisorCents).toBe(2 * 80_000);
    expect(out.costs.transportCents).toBe(2 * 100_000);
    expect(out.warnings.some((w) => w.includes('runs over 2 days'))).toBe(true);
  });

  it('respects a short working window', () => {
    const { hours } = computeEstimate({ ...survey, workingWindowHours: 2 }, DEFAULT_RATES);
    expect(hours.hoursPerPersonPerDay).toBe(2);
    expect(hours.jobDays).toBe(1);
    expect(hours.crewSize).toBe(2); // ceil(3.09 ÷ 2)
  });

  it('uses the measured m² when an area is not a preset', () => {
    const out = computeEstimate(
      { ...survey, areas: [{ areaType: 'Store or warehouse', cleanLevel: 'ROUTINE', roomCount: 1, sizePreset: 'MEASURED', measuredM2: 1100 }], items: [] },
      DEFAULT_RATES,
    );
    expect(out.lines[0]!.units).toBe(1100);
    expect(out.lines[0]!.personHours).toBe(2); // 1,100 ÷ 550
  });

  it('warns and prices at zero for an area or item the rates card does not know', () => {
    const out = computeEstimate(
      { ...survey, areas: [{ areaType: 'Helipad', cleanLevel: 'DEEP', roomCount: 1, sizePreset: 'LARGE' }], items: [{ itemType: 'Piano', quantity: 1 }] },
      DEFAULT_RATES,
    );
    expect(out.lines.every((l) => l.personHours === 0)).toBe(true);
    expect(out.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Helipad'), expect.stringContaining('Piano')]));
  });

  it('reports the compliant-pay row exactly as the sheet does, without pricing it in', () => {
    const { compliance, costs } = computeEstimate(survey, DEFAULT_RATES);
    expect(compliance.meetsLegalMinimum).toBe(false); // 800 < 868.44
    // 1 × 1 × 868.44 × 1.1 + 230 + 1,000 = 2,185.28
    expect(compliance.legalDirectCostCents).toBe(218_528);
    expect(compliance.legalMarginPct).toBe(0.5144); // 1 − 2,185.28 ÷ 4,500
    expect(costs.labourCents).toBe(80_000); // main build-up still at actual pay

    const withSupervisor = computeEstimate({ ...survey, supervisorOnSite: true }, DEFAULT_RATES).compliance;
    expect(withSupervisor.legalDirectCostCents).toBe(218_528); // no supervisor term in the legal row
  });

  it('is deterministic', () => {
    expect(computeEstimate(survey, DEFAULT_RATES)).toEqual(computeEstimate(survey, DEFAULT_RATES));
  });
});

const costing = (c: Partial<EstimateCostingInput> = {}): EstimateCostingInput => ({
  extraMaterials: [],
  ownedMachines: [],
  boughtMachines: [],
  hiredMachines: [],
  upfrontPurchases: [],
  ...c,
});
const emptySurvey: QuoteSurveyInput = { ...survey, areas: [], items: [] };
const scrubber: OwnedMachineCopy = {
  name: 'Scrubber', category: 'MACHINE', costCents: 26_000_000, salvageValueCents: 2_000_000,
  usefulLifeMonths: 48, retired: false, deleted: false,
};
const at25Days: QuoteRates = { ...DEFAULT_RATES, workingDaysPerMonth: 25 };

describe('computeEstimate with a costing', () => {
  it('charges lunch per person per job day once a costing is passed, even an empty one', () => {
    const none = computeEstimate(survey, DEFAULT_RATES).costs;
    expect(none.lunchCents).toBe(0);
    expect(none.directCostCents).toBe(207_000);

    const empty = computeEstimate(survey, DEFAULT_RATES, costing()).costs;
    expect(empty.lunchCents).toBe(10_000); // 1 cleaner × 1 day × KSh 100
    expect(empty.directCostCents).toBe(217_000);
  });

  it('AE1: profit and margin at the client price, graded and not floored', () => {
    // Cost base KSh 10,000: one cleaner day at KSh 8,000 by hand, no lunch,
    // transport or wear, 25% contingency.
    const rates: QuoteRates = { ...DEFAULT_RATES, contingencyPct: 0.25, equipmentWearPct: 0 };
    const out = computeEstimate(emptySurvey, rates, costing({
      cleanerPayPerDayCents: 800_000, lunchPerPersonPerDayCents: 0, transportPerDayCents: 0,
      clientPriceCents: 1_200_000, clientPriceBasis: 'VISIT',
    }));
    expect(out.costs.costBaseCents).toBe(1_000_000);
    expect(out.pricing.recommendedPerVisitCents).toBe(1_700_000); // 1,000,000 ÷ 0.6 → KSh 17,000
    expect(out.pricing.pricePerVisitCents).toBe(1_200_000);
    expect(out.profit.perVisitCents).toBe(200_000);
    expect(out.pricing.marginPct).toBe(0.1667); // 1 − 10,000 ÷ 12,000
    expect(out.pricing.marginCheck).toBe('BELOW MINIMUM');
  });

  it('AE2: a monthly price at 4 visits gives the per-visit price and profit per visit and per month', () => {
    const out = computeEstimate({ ...survey, frequencyLabel: 'Weekly (4 visits)' }, DEFAULT_RATES, costing({
      contractMonths: 12, clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH', clientPriceVisitsPerMonth: 4,
    }));
    expect(out.costs.costBaseCents).toBe(238_700); // (207,000 + 10,000 lunch) × 1.1
    expect(out.pricing.pricePerVisitCents).toBe(2_200_000);
    expect(out.pricing.monthlyValueCents).toBe(8_800_000);
    expect(out.profit.perVisitCents).toBe(1_961_300); // 2,200,000 − 238,700
    expect(out.profit.perMonthCents).toBe(7_845_200); // 8,800,000 − 4 × 238,700
    expect(out.profit.perContractCents).toBe(94_142_400); // × 12
  });

  it('keeps a monthly price exact when it does not divide evenly into visits', () => {
    const { pricing, warnings } = computeEstimate({ ...survey, frequencyLabel: 'Daily (22 visits)' }, DEFAULT_RATES, costing({
      contractMonths: 12, clientPriceCents: 10_000_000, clientPriceBasis: 'MONTH', clientPriceVisitsPerMonth: 22,
    }));
    expect(pricing.pricePerVisitCents).toBe(454_545); // 10,000,000 ÷ 22
    expect(pricing.monthlyValueCents).toBe(10_000_000);
    expect(warnings.some((w) => w.includes('monthly price'))).toBe(false);
  });

  it('AE3: wears an owned machine per job day from the register figures', () => {
    const out = computeEstimate(survey, at25Days, costing({ jobDays: 2, ownedMachines: [{ assetId: 'a1', asset: scrubber }] }));
    // (260,000 − 20,000) ÷ 48 months ÷ 25 days = KSh 200 per job day
    expect(out.machines).toEqual([{ kind: 'OWNED', name: 'Scrubber', perJobDayCents: 20_000, daysUsed: 2, cents: 40_000 }]);
    expect(out.costs.machineWearCents).toBe(40_000);
  });

  it('never charges negative wear when salvage is above cost', () => {
    const out = computeEstimate(survey, at25Days, costing({
      ownedMachines: [{ assetId: 'a1', asset: { ...scrubber, costCents: 1_000_000, salvageValueCents: 2_000_000 } }],
    }));
    expect(out.machines[0]!.cents).toBe(0);
  });

  it('charges only the days a machine is used', () => {
    const out = computeEstimate(survey, at25Days, costing({ jobDays: 2, ownedMachines: [{ assetId: 'a1', daysUsed: 1, asset: scrubber }] }));
    expect(out.machines[0]).toMatchObject({ daysUsed: 1, cents: 20_000 });
  });

  it('spreads a machine bought for the job over its life with no salvage', () => {
    const out = computeEstimate(survey, at25Days, costing({ jobDays: 2, boughtMachines: [{ name: 'New buffer', priceCents: 26_000_000, lifeMonths: 48 }] }));
    // 260,000 ÷ 48 ÷ 25 = KSh 216.67 per job day
    expect(out.machines).toEqual([{ kind: 'BOUGHT', name: 'New buffer', perJobDayCents: 21_667, daysUsed: 2, cents: 43_333 }]);
  });

  it('charges a hired machine once per visit, whatever the job days', () => {
    const out = computeEstimate(survey, DEFAULT_RATES, costing({ jobDays: 2, hiredMachines: [{ name: 'Scaffold', hirePerVisitCents: 300_000 }] }));
    expect(out.machines).toEqual([{ kind: 'HIRED', name: 'Scaffold', perJobDayCents: null, daysUsed: null, cents: 300_000 }]);
    expect(out.costs.machineHireCents).toBe(300_000);
  });

  it('uses typed wear when the register has no life, and warns about retired, deleted and re-lifed machines', () => {
    const out = computeEstimate(survey, at25Days, costing({
      ownedMachines: [
        { assetId: 'a1', wearPerDayCents: 15_000, asset: { ...scrubber, name: 'Old vacuum', usefulLifeMonths: null } },
        { assetId: 'a2', wearPerDayCents: 15_000, asset: { ...scrubber, name: 'Polisher' } },
        { assetId: 'a3', asset: { ...scrubber, name: 'Dryer', retired: true } },
        { assetId: 'a4', asset: { ...scrubber, name: 'Steamer', deleted: true } },
      ],
    }));
    expect(out.machines.map((m) => m.perJobDayCents)).toEqual([15_000, 20_000, 20_000, 20_000]);
    expect(out.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Polisher'),
      expect.stringContaining('Dryer'),
      expect.stringContaining('Steamer'),
    ]));
    expect(out.warnings.some((w) => w.includes('Old vacuum'))).toBe(false);
  });

  it('AE5: costs a quote with no survey from the crew and days set by hand', () => {
    const out = computeEstimate(emptySurvey, DEFAULT_RATES, costing({
      crewSize: 4, jobDays: 1, supervisorDays: 1, clientPriceCents: 1_000_000, clientPriceBasis: 'VISIT',
    }));
    expect(out.hours).toMatchObject({ crewSize: 4, jobDays: 1, supervisorDays: 1, surveyCrewSize: 1, surveyJobDays: 1, surveySupervisorDays: 0 });
    expect(out.costs.labourCents).toBe(320_000); // 4 × 1 × KSh 800
    expect(out.costs.supervisorCents).toBe(80_000);
    expect(out.costs.lunchCents).toBe(50_000); // 5 people × KSh 100
    expect(out.costs.transportCents).toBe(100_000); // 1 day, zone 1
    expect(out.costs.equipmentWearCents).toBe(20_000); // 5% of 400,000
    expect(out.costs.costBaseCents).toBe(627_000); // 570,000 × 1.1
    expect(out.profit.perVisitCents).toBe(373_000);
    expect(out.warnings.some((w) => w.startsWith('Nothing to price'))).toBe(false);
  });

  it('follows hand-set job days for the supervisor when supervisor days are left empty', () => {
    const { hours } = computeEstimate({ ...survey, supervisorOnSite: true }, DEFAULT_RATES, costing({ jobDays: 2 }));
    expect(hours.supervisorDays).toBe(2);
    expect(hours.surveySupervisorDays).toBe(1);
  });

  it('pays a hand-set cleaner day rate and takes the equipment allowance from it', () => {
    const out = computeEstimate(survey, DEFAULT_RATES, costing({ cleanerPayPerDayCents: 100_000 }));
    expect(out.dayRates.cleanerPayPerDayCents).toBe(100_000);
    expect(out.costs.labourCents).toBe(100_000);
    expect(out.costs.equipmentWearCents).toBe(5_000);
    expect(out.compliance.meetsLegalMinimum).toBe(true); // KSh 1,000 ≥ 868.44
  });

  it('applies contingency to a direct cost that includes lunch, materials, machines and upfront purchases', () => {
    const { costs } = computeEstimate(survey, DEFAULT_RATES, costing({
      extraMaterials: [{ name: 'Degreaser', amountCents: 20_000 }],
      hiredMachines: [{ name: 'Scaffold', hirePerVisitCents: 300_000 }],
      upfrontPurchases: [{ name: 'Ladder', amountCents: 500_000 }],
    }));
    expect(costs.extraMaterialsCents).toBe(20_000);
    expect(costs.upfrontCents).toBe(500_000); // one-off: in full
    expect(costs.directCostCents).toBe(1_037_000); // 207,000 + 10,000 + 20,000 + 300,000 + 500,000
    expect(costs.contingencyCents).toBe(103_700);
  });

  it('AE7: spreads upfront purchases over a recurring contract and shows profit for its length', () => {
    const out = computeEstimate({ ...survey, frequencyLabel: 'Weekly (4 visits)' }, DEFAULT_RATES, costing({
      contractMonths: 12, upfrontPurchases: [{ name: 'Mops and buckets', amountCents: 2_400_000 }],
      clientPriceCents: 500_000, clientPriceBasis: 'VISIT',
    }));
    expect(out.costs.upfrontCents).toBe(50_000); // 2,400,000 ÷ (12 × 4)
    expect(out.costs.costBaseCents).toBe(293_700); // (207,000 + 10,000 + 50,000) × 1.1
    expect(out.profit).toEqual({ perVisitCents: 206_300, contractMonths: 12, perMonthCents: 825_200, perContractCents: 9_902_400 });
  });

  it('charges upfront purchases in full to a one-off, with no monthly or contract figures', () => {
    const out = computeEstimate(survey, DEFAULT_RATES, costing({ upfrontPurchases: [{ name: 'Mops', amountCents: 2_400_000 }] }));
    expect(out.costs.upfrontCents).toBe(2_400_000);
    expect(out.profit).toMatchObject({ contractMonths: null, perMonthCents: null, perContractCents: null });
  });

  it('treats a repeating quote with no contract length as a one-off, and says so', () => {
    const weekly = computeEstimate({ ...survey, frequencyLabel: 'Weekly (4 visits)' }, DEFAULT_RATES, costing({
      upfrontPurchases: [{ name: 'Mops', amountCents: 2_400_000 }],
    }));
    expect(weekly.costs.upfrontCents).toBe(2_400_000);
    expect(weekly.profit.perMonthCents).toBeNull();
    expect(weekly.warnings.some((w) => w.includes('no contract length'))).toBe(true);

    const monthlyRequest = computeEstimate({ ...survey, frequencyLabel: 'Monthly (1 visit)' }, DEFAULT_RATES, costing({ requestFrequency: 'MONTHLY' }));
    expect(monthlyRequest.warnings.some((w) => w.includes('no contract length'))).toBe(true);

    const oneOff = computeEstimate(survey, DEFAULT_RATES, costing({ requestFrequency: 'NONE' }));
    expect(oneOff.warnings.some((w) => w.includes('no contract length'))).toBe(false);
  });

  it('keeps a monthly price when visits change, and warns', () => {
    const out = computeEstimate({ ...survey, frequencyLabel: 'Twice weekly (8 visits)' }, DEFAULT_RATES, costing({
      contractMonths: 12, clientPriceCents: 8_800_000, clientPriceBasis: 'MONTH', clientPriceVisitsPerMonth: 4,
    }));
    expect(out.pricing.monthlyValueCents).toBe(8_800_000);
    expect(out.pricing.pricePerVisitCents).toBe(1_100_000);
    expect(out.warnings.some((w) => w.includes('monthly price'))).toBe(true);
  });

  it('pays no commission when the client price is below direct cost', () => {
    const { commission } = computeEstimate({ ...survey, traineeSourced: true }, DEFAULT_RATES, costing({
      clientPriceCents: 100_000, clientPriceBasis: 'VISIT',
    }));
    expect(commission.netProfitPerVisitCents).toBe(-117_000); // 100,000 − 217,000
    expect(commission.commissionCents).toBe(0);
  });

  it('grades a client price of 0 BELOW MINIMUM', () => {
    const { pricing } = computeEstimate(survey, DEFAULT_RATES, costing({ clientPriceCents: 0, clientPriceBasis: 'VISIT' }));
    expect(pricing.pricePerVisitCents).toBe(0);
    expect(pricing.marginCheck).toBe('BELOW MINIMUM');
  });
});
