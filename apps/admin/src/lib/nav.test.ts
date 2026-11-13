import { describe, expect, it } from 'vitest';

import { JOB_REPORTS, OPERATIONS, OWNER_FINANCE, OWNER_GOVERNANCE, WEBSITE, isActivePath } from './nav';

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

describe('the menus', () => {
  // Insights is the Dashboard's trend section now; its address only redirects there.
  it('have no item that points at /insights', () => {
    for (const menu of [OWNER, STAFF]) {
      expect(menu.map((item) => item.href)).not.toContain('/insights');
    }
    expect(highlighted('/insights')).toEqual([]);
  });
});
