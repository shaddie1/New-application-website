import { describe, expect, it } from 'vitest';

import {
  JOB_REPORTS, OPERATIONS, OWNER_FINANCE, OWNER_GOVERNANCE, WEBSITE, isActivePath, menuSections,
} from './nav';

// The two menus the layout builds: the owner's, and everyone else's at its fullest.
const OWNER = [...OPERATIONS, ...OWNER_FINANCE, ...OWNER_GOVERNANCE, ...WEBSITE];
const STAFF = [...OPERATIONS, JOB_REPORTS, ...WEBSITE];

/** The labels of every item the menu would highlight on the page at `pathname`. */
const highlighted = (pathname: string, menu = OWNER) =>
  menu.filter((item) => isActivePath(pathname, item.href)).map((item) => item.label);

describe('isActivePath', () => {
  it('highlights Jobs & costs on /financials, and not Company finance', () => {
    expect(highlighted('/financials')).toEqual(['Jobs & costs']);
    expect(highlighted('/financials/x')).toEqual(['Jobs & costs']);
  });

  it('highlights Company finance only on /finance', () => {
    expect(highlighted('/finance')).toEqual(['Company finance']);
    expect(highlighted('/finance/assets')).toEqual(['Company finance']);
  });

  it('highlights Dashboard only on /', () => {
    expect(highlighted('/')).toEqual(['Dashboard']);
  });

  it('highlights Projects on a page under /projects', () => {
    expect(highlighted('/projects')).toEqual(['Projects']);
    expect(highlighted('/projects/abc')).toEqual(['Projects']);
  });

  it('highlights nothing for a path that matches no item', () => {
    expect(highlighted('/profile')).toEqual([]);
    expect(highlighted('/project')).toEqual([]);
    expect(highlighted('/financials-old')).toEqual([]);
    // Job Reports is not in the owner's menu.
    expect(highlighted('/job-reports')).toEqual([]);
  });

  it('highlights exactly the item whose page is open, for every item in both menus', () => {
    for (const menu of [OWNER, STAFF]) {
      for (const item of menu) {
        expect(highlighted(item.href, menu)).toEqual([item.label]);
      }
    }
  });
});

describe('menuSections', () => {
  const owner = { isOwner: true, canPublishWebsite: true };
  const staff = { isOwner: false, canPublishWebsite: false };

  /** Each section as its title and its items' labels. */
  const labels = (viewer: Parameters<typeof menuSections>[0]) =>
    menuSections(viewer).map((section) => [section.title, section.items.map((item) => item.label)]);
  const items = (viewer: Parameters<typeof menuSections>[0]) => menuSections(viewer).flatMap((section) => section.items);

  it('puts Machines under Finance for an owner who may see the register', () => {
    expect(labels({ ...owner, canViewMachines: true })).toEqual([
      ['Operations', ['Dashboard', 'Projects', 'Calendar', 'Bookings', 'Quotes']],
      ['Finance', ['Insights', 'Jobs & costs', 'Company finance', 'Quote rates', 'Machines']],
      ['Governance', ['Ownership', 'Documents', 'Team']],
      ['Website', ['Website jobs']],
    ]);
  });

  it('gives any other viewer of the register a Finance section holding only Machines', () => {
    expect(labels({ ...staff, canViewMachines: true })).toEqual([
      ['Operations', ['Dashboard', 'Projects', 'Calendar', 'Bookings', 'Quotes', 'Job reports']],
      ['Finance', ['Machines']],
    ]);
    expect(labels({ isOwner: false, canPublishWebsite: true, canViewMachines: true }).map(([title]) => title)).toEqual([
      'Operations', 'Finance', 'Website',
    ]);
  });

  it('leaves Machines out, and the Finance section with it, for someone who may not see the register', () => {
    expect(labels({ ...staff, canViewMachines: false })).toEqual([
      ['Operations', ['Dashboard', 'Projects', 'Calendar', 'Bookings', 'Quotes', 'Job reports']],
    ]);
    expect(labels({ ...owner, canViewMachines: false })).toEqual([
      ['Operations', ['Dashboard', 'Projects', 'Calendar', 'Bookings', 'Quotes']],
      ['Finance', ['Insights', 'Jobs & costs', 'Company finance', 'Quote rates']],
      ['Governance', ['Ownership', 'Documents', 'Team']],
      ['Website', ['Website jobs']],
    ]);
  });

  it('highlights Machines only on /machines, in the owner’s menu and in a viewer’s', () => {
    for (const menu of [items({ ...owner, canViewMachines: true }), items({ ...staff, canViewMachines: true })]) {
      expect(highlighted('/machines', menu)).toEqual(['Machines']);
      expect(highlighted('/machines/abc', menu)).toEqual(['Machines']);
      expect(highlighted('/machines-old', menu)).toEqual([]);
      // On every other page of the menu, only that page's own item is highlighted.
      for (const item of menu) {
        expect(highlighted(item.href, menu)).toEqual([item.label]);
      }
    }
  });
});
