import { describe, expect, it } from 'vitest';
import type { DashboardAccess } from '@onyxhawk/types';

import { accessView, NO_SECTION_RE_ASKED, sectionRefusal, withReAsked } from './access-state';
import type { Block } from './block-state';

const loaded = (access: DashboardAccess): Block<DashboardAccess> => ({
  status: 'loaded',
  data: access,
  refreshing: false,
});

const coo: DashboardAccess = {
  sections: ['attention', 'month', 'trend', 'breakdown'],
  canSetTargets: true,
  canManageOwnership: false,
  holder: 'not-linked',
};

describe('accessView', () => {
  it('is loading until the server answers', () => {
    expect(accessView({ status: 'loading' })).toEqual({ kind: 'loading' });
  });

  it('says the back-office is being updated when the server does not know the address', () => {
    expect(accessView({ status: 'failed', httpStatus: 404 })).toEqual({ kind: 'being-updated' });
  });

  it('is a failure to retry when the server faults or cannot be reached', () => {
    expect(accessView({ status: 'failed', httpStatus: 500 })).toEqual({ kind: 'failed' });
    expect(accessView({ status: 'failed', httpStatus: 502 })).toEqual({ kind: 'failed' });
    expect(accessView({ status: 'failed' })).toEqual({ kind: 'failed' });
  });

  it('signs the user out when the server refuses the account', () => {
    expect(accessView({ status: 'failed', httpStatus: 403 })).toEqual({ kind: 'sign-out' });
  });

  it('shows the "not linked" note to an account with no section', () => {
    const unlinked: DashboardAccess = {
      sections: [],
      canSetTargets: false,
      canManageOwnership: false,
      holder: 'not-linked',
    };
    expect(accessView(loaded(unlinked))).toEqual({ kind: 'not-linked' });
  });

  it('gives the permitted sections and what the account may do there', () => {
    expect(accessView(loaded(coo))).toEqual({
      kind: 'sections',
      sections: ['attention', 'month', 'trend', 'breakdown'],
      canSetTargets: true,
      canManageOwnership: false,
    });
  });

  it('keeps the sections on screen while access is asked for again', () => {
    expect(accessView({ status: 'loaded', data: coo, refreshing: true })).toMatchObject({
      kind: 'sections',
      sections: coo.sections,
    });
  });
});

describe('sectionRefusal', () => {
  const refused: Block<unknown> = { status: 'failed', httpStatus: 403 };

  it('asks for access again the first time a section is refused', () => {
    expect(sectionRefusal(refused, 'month', NO_SECTION_RE_ASKED)).toBe('ask-access-again');
  });

  it('shows the section its own error when it is refused again after that re-ask', () => {
    const reAsked = withReAsked(NO_SECTION_RE_ASKED, 'month');
    expect(sectionRefusal(refused, 'month', reAsked)).toBe('section-error');
  });

  it('counts each section by itself', () => {
    const reAsked = withReAsked(NO_SECTION_RE_ASKED, 'month');
    expect(sectionRefusal(refused, 'breakdown', reAsked)).toBe('ask-access-again');
  });

  it('leaves an outage to the section, with nothing to ask the access list', () => {
    expect(sectionRefusal({ status: 'failed', httpStatus: 500 }, 'month', NO_SECTION_RE_ASKED)).toBe('section-error');
    expect(sectionRefusal({ status: 'failed' }, 'month', NO_SECTION_RE_ASKED)).toBe('section-error');
  });

  it('has nothing to say about a block that has not failed', () => {
    expect(sectionRefusal({ status: 'loading' }, 'month', NO_SECTION_RE_ASKED)).toBe('none');
    expect(sectionRefusal({ status: 'loaded', data: 1, refreshing: false }, 'month', NO_SECTION_RE_ASKED)).toBe('none');
  });
});

describe('withReAsked', () => {
  it('adds the section without changing the set it was given', () => {
    const reAsked = withReAsked(NO_SECTION_RE_ASKED, 'ownership');
    expect([...reAsked]).toEqual(['ownership']);
    expect(NO_SECTION_RE_ASKED.size).toBe(0);
  });

  it('gives back the same set when the section is already in it, so nothing re-renders', () => {
    const reAsked = withReAsked(NO_SECTION_RE_ASKED, 'ownership');
    expect(withReAsked(reAsked, 'ownership')).toBe(reAsked);
  });
});
