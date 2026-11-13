import { describe, expect, it } from 'vitest';
import type { DashboardSection } from '@onyxhawk/types';

import { hashScrollStep, type HashScrollQuestion } from './hash-scroll';

const settled = (...sections: DashboardSection[]): ReadonlySet<DashboardSection> => new Set(sections);

// The owner, arriving from /insights: every section is built and none has answered yet.
const owner: HashScrollQuestion = {
  fragment: '#trend',
  sections: ['attention', 'month', 'trend', 'breakdown', 'ownership'],
  settled: settled(),
  done: false,
};

describe('hashScrollStep', () => {
  it('waits while a section above the trend is still loading', () => {
    expect(hashScrollStep(owner)).toEqual({ step: 'wait', done: false });
    expect(hashScrollStep({ ...owner, settled: settled('attention') })).toEqual({ step: 'wait', done: false });
    expect(hashScrollStep({ ...owner, settled: settled('month') })).toEqual({ step: 'wait', done: false });
  });

  it('waits until the access list has said which sections there are', () => {
    expect(hashScrollStep({ ...owner, sections: null })).toEqual({ step: 'wait', done: false });
  });

  it('scrolls once the sections above the trend have settled, and never a second time', () => {
    // The breakdown and the ownership summary lie below the trend, so they are not waited for.
    const ready = { ...owner, settled: settled('attention', 'month') };
    const first = hashScrollStep(ready);
    expect(first).toEqual({ step: 'scroll', done: true });
    // Asked again, as after a change of month: the visit has had its scroll.
    expect(hashScrollStep({ ...ready, done: first.done })).toEqual({ step: 'nothing', done: true });
  });

  it('waits only for the sections above the trend that the account has', () => {
    // The financial manager has no "Needs attention".
    const finance: HashScrollQuestion = {
      ...owner,
      sections: ['month', 'trend', 'breakdown'],
      settled: settled('month'),
    };
    expect(hashScrollStep(finance)).toEqual({ step: 'scroll', done: true });
  });

  it('drops the fragment for an account with no trend section', () => {
    // support@onyxhawk.test has "Needs attention" alone.
    const support: HashScrollQuestion = { ...owner, sections: ['attention'] };
    const first = hashScrollStep(support);
    expect(first).toEqual({ step: 'drop-fragment', done: true });
    expect(hashScrollStep({ ...support, done: first.done })).toEqual({ step: 'nothing', done: true });
    // An account with no section at all.
    expect(hashScrollStep({ ...owner, sections: [] })).toEqual({ step: 'drop-fragment', done: true });
  });

  it('does nothing when the address has no fragment', () => {
    expect(hashScrollStep({ ...owner, fragment: '' })).toEqual({ step: 'nothing', done: true });
    // Not even once the sections have settled.
    expect(hashScrollStep({ ...owner, fragment: '', settled: settled('attention', 'month') })).toEqual({
      step: 'nothing',
      done: true,
    });
  });
});
