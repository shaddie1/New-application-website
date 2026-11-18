import { describe, expect, it } from 'vitest';

import {
  companyPartLine, daysText, earnBackLine, entitledText, hireChargeText, hireLabel, oldHireNotice, ownedBy,
  paidUndoMessage, potText, priceText, removeHireMessage, stillOwedText,
} from './wording';

describe('earnBackLine', () => {
  it('says how much is still to earn back while the gap is above zero', () => {
    expect(earnBackLine({ earnBackGapCents: 6_000_000, paidForItself: false })).toBe('KSh 60,000 still to earn back');
  });

  it('says paid for itself and how far ahead once the gap is below zero', () => {
    expect(earnBackLine({ earnBackGapCents: -1_000_000, paidForItself: true })).toBe(
      'Paid for itself, KSh 10,000 ahead',
    );
  });

  it('says only paid for itself when it has earned back exactly its price and repairs', () => {
    expect(earnBackLine({ earnBackGapCents: 0, paidForItself: true })).toBe('Paid for itself');
  });

  it('has nothing to earn back for a machine with no price that has earned nothing', () => {
    expect(earnBackLine({ earnBackGapCents: 0, paidForItself: false })).toBe('Nothing to earn back yet');
  });
});

describe('ownedBy', () => {
  it('is the company when there are no investors', () => {
    expect(ownedBy({ investors: [], companyShareBps: 10_000 })).toBe('The company');
  });

  it('names each investor’s share and the company’s when investors cover part of the price', () => {
    expect(ownedBy({ investors: [{ name: 'Amina', shareBps: 6_000 }], companyShareBps: 4_000 })).toBe(
      'Amina 60%, the company 40%',
    );
  });

  it('leaves the company out when investors cover the whole price', () => {
    expect(
      ownedBy({
        investors: [{ name: 'Amina', shareBps: 7_500 }, { name: 'Brian', shareBps: 2_500 }],
        companyShareBps: 0,
      }),
    ).toBe('Amina 75%, Brian 25%');
  });
});

describe('companyPartLine', () => {
  it('names the company’s share and its part, which stays in the pot', () => {
    expect(companyPartLine({ companyShareBps: 4_000, companyPartCents: 1_600_000 })).toBe(
      'The company holds 40%. Its part, KSh 16,000, stays in the pot.',
    );
  });

  it('is KSh 0 when repairs have outrun earnings, never a negative part', () => {
    expect(companyPartLine({ companyShareBps: 4_000, companyPartCents: -200_000 })).toBe(
      'The company holds 40%. Its part, KSh 0, stays in the pot.',
    );
  });

  it('is null when investors cover the whole price', () => {
    expect(companyPartLine({ companyShareBps: 0, companyPartCents: 1 })).toBeNull();
  });
});

describe('stillOwedText', () => {
  it('is the amount still owed', () => {
    expect(stillOwedText({ owedCents: 400_000, overpaidCents: 0 })).toBe('KSh 4,000');
    expect(stillOwedText({ owedCents: 0, overpaidCents: 0 })).toBe('KSh 0');
  });

  it('says overpaid by the amount, never a negative amount still owed', () => {
    expect(stillOwedText({ owedCents: 0, overpaidCents: 200_000 })).toBe('Overpaid by KSh 2,000');
  });
});

describe('entitledText', () => {
  it('is the amount the pot holds for them', () => {
    expect(entitledText(2_400_000)).toBe('KSh 24,000');
    expect(entitledText(1_799_999)).toBe('KSh 17,999.99');
  });

  it('is KSh 0 when repairs have outrun earnings, never a negative entitlement', () => {
    expect(entitledText(-300_000)).toBe('KSh 0');
  });
});

describe('potText', () => {
  it('is the amount in the pot', () => {
    expect(potText(2_000_000)).toBe('KSh 20,000');
    expect(potText(0)).toBe('KSh 0');
  });

  it('says short by the amount when the pot is below zero', () => {
    expect(potText(-500_000)).toBe('Short by KSh 5,000');
  });
});

describe('priceText', () => {
  it('is the price', () => {
    expect(priceText(26_000_000)).toBe('KSh 260,000');
  });

  it('is a dash for a machine with no price', () => {
    expect(priceText(0)).toBe('—');
  });
});

describe('daysText', () => {
  it('writes half days as days', () => {
    expect(daysText(5)).toBe('2.5 days');
    expect(daysText(6)).toBe('3 days');
    expect(daysText(1)).toBe('0.5 days');
  });

  it('writes one day in the singular', () => {
    expect(daysText(2)).toBe('1 day');
  });
});

describe('hireChargeText', () => {
  it('is null for a hire charged its amount: the amount already says it', () => {
    expect(hireChargeText({ chargedCents: 700_000, amountCents: 700_000 })).toBeNull();
  });

  it('says what an older hire was charged when that differs from the machine’s amount', () => {
    expect(hireChargeText({ chargedCents: 1_050_000, amountCents: 600_000 })).toBe('Charged KSh 10,500');
  });

  it('says how far below the machine’s amount an older hire was charged', () => {
    expect(hireChargeText({ chargedCents: 500_000, amountCents: 600_000 })).toBe(
      'Charged KSh 5,000, KSh 1,000 less than the machine’s amount',
    );
  });

  it('is null for days on a job, which have no charge of their own', () => {
    expect(hireChargeText({ chargedCents: null, amountCents: 600_000 })).toBeNull();
  });
});

describe('oldHireNotice (R10)', () => {
  it('AE7: gives the amount charged, the machine’s amount and the job’s profit, before and after', () => {
    expect(oldHireNotice({
      before: { chargedCents: 1_050_000, machineCents: 600_000, profitCents: 450_000 },
      after: { chargedCents: 1_050_000, machineCents: 1_050_000, profitCents: 0 },
    })).toEqual([
      'Amount charged: KSh 10,500 → KSh 10,500',
      'Machine’s amount: KSh 6,000 → KSh 10,500',
      'Job’s profit on the hire: KSh 4,500 → KSh 0',
    ]);
  });
});

describe('paidUndoMessage (R14)', () => {
  it('names the date and the reference that are cleared, and that no figure changes', () => {
    expect(paidUndoMessage({ paidOn: '2026-11-14', paymentRef: 'QK7XYZ12' })).toBe(
      'The paid date, 14 Nov 2026, and the reference QK7XYZ12 are cleared, and the hire shows “Awaiting payment” again. No figure changes.',
    );
  });

  it('leaves out a reference the hire does not have', () => {
    expect(paidUndoMessage({ paidOn: '2026-11-14', paymentRef: null })).toBe(
      'The paid date, 14 Nov 2026, is cleared, and the hire shows “Awaiting payment” again. No figure changes.',
    );
  });
});

describe('hireLabel', () => {
  it('names the customer when the server sent the name', () => {
    expect(hireLabel({ customerName: 'Mwangi Hardware' })).toBe('Hire to Mwangi Hardware');
  });

  it('is only "Hire" for a viewer, who is not sent the name', () => {
    expect(hireLabel({})).toBe('Hire');
  });
});

describe('removeHireMessage', () => {
  it('for a hire charged its amount, says that amount leaves the income and the pot together', () => {
    expect(removeHireMessage({ chargedCents: 700_000, amountCents: 700_000 })).toBe(
      'The hire’s one-off job in Jobs & costs is deleted with it, and any costs logged on that job. ' +
      'Its KSh 7,000 leaves the income and the pot alike. This cannot be undone.',
    );
  });

  // An older hire: three days at KSh 2,000, charged KSh 10,500.
  const hire = { chargedCents: 1_050_000, amountCents: 600_000 };

  it('for an older hire, says the hire\'s job goes with its income and costs, and what leaves the pot', () => {
    expect(removeHireMessage(hire)).toBe(
      'The hire’s one-off job in Jobs & costs is deleted with it: its income of KSh 10,500 and any costs logged ' +
      'on that job. KSh 6,000 leaves the pot. This cannot be undone.',
    );
    expect(removeHireMessage({ ...hire, otherMachines: [] })).toBe(removeHireMessage(hire));
  });

  it('names every other machine with days on the hire\'s job, its days and the amount that leaves its pot', () => {
    const otherMachines = [
      { machineName: 'Steam cleaner', halfDays: 2, amountCents: 100_000 },
      { machineName: 'Carpet extractor', halfDays: 5, amountCents: 375_000 },
    ];

    expect(removeHireMessage({ ...hire, otherMachines })).toBe(
      [
        'The hire’s one-off job in Jobs & costs is deleted with it: its income of KSh 10,500 and any costs logged ' +
        'on that job. KSh 6,000 leaves the pot.',
        '',
        'The days logged on that job for other machines are removed too. Each amount leaves that machine’s pot:',
        'Steam cleaner, 1 day: KSh 1,000',
        'Carpet extractor, 2.5 days: KSh 3,750',
        '',
        'This cannot be undone.',
      ].join('\n'),
    );
  });
});
