import { describe, expect, it } from 'vitest';
import type { JobMachineLineDto } from '@onyxhawk/types';

import { deleteJobMessage } from './jobMachines';

const scrubber: JobMachineLineDto = {
  id: 'line-1',
  machineName: 'Floor scrubber',
  halfDays: 5,
  rateCents: 200_000,
  amountCents: 500_000,
  isHire: false,
};

const extractor: JobMachineLineDto = {
  id: 'line-2',
  machineName: 'Carpet extractor',
  halfDays: 2,
  rateCents: 150_000,
  amountCents: 150_000,
  isHire: false,
};

describe('deleteJobMessage', () => {
  it('asks what it asked before for a job with no machine days', () => {
    expect(deleteJobMessage({ title: 'Office clean' })).toBe('Delete "Office clean" and all its expenses?');
    expect(deleteJobMessage({ title: 'Office clean', machineLines: [] })).toBe(
      'Delete "Office clean" and all its expenses?',
    );
  });

  it('names the machine, its days and the amount that will leave its pot', () => {
    expect(deleteJobMessage({ title: 'Office clean', machineLines: [scrubber] })).toBe(
      [
        'Delete "Office clean" and all its expenses?',
        '',
        "The machine days logged on it will be removed too. Each amount leaves that machine's pot:",
        'Floor scrubber, 2.5 days: KSh 5,000',
      ].join('\n'),
    );
  });

  it('names every machine on the job', () => {
    const message = deleteJobMessage({ title: 'Mall deep clean', machineLines: [scrubber, extractor] });

    expect(message).toContain('Floor scrubber, 2.5 days: KSh 5,000');
    expect(message).toContain('Carpet extractor, 1 day: KSh 1,500');
  });

  it('says so when the days are a hire', () => {
    const hire: JobMachineLineDto = { ...scrubber, halfDays: 6, amountCents: 600_000, isHire: true };

    expect(deleteJobMessage({ title: 'Hire: Floor scrubber', machineLines: [hire] })).toContain(
      'Floor scrubber, 3 days on hire: KSh 6,000',
    );
  });
});
