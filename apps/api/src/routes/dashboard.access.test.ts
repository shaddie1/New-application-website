import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSection } from '@onyxhawk/types';

import { CAST_IDS, type CastId, requestAs, seedCast } from '../test-support/cast.js';
import { resetDb } from '../test-support/financialsDb.js';

vi.mock('../db.js', async () => ({ prisma: (await import('../test-support/financialsDb.js')).db }));

// The access table of the merged Dashboard, as a test: every kind of account
// down the side, every address the Dashboard's data comes from across, and the
// status each cell must answer. The source of truth for who sees which section
// is the access list in src/dashboard/access.ts. A second table pins what the
// routes the Dashboard does not use answer today.

const RANGE = 'from=2026-11-01&to=2026-11-30';
const MONTH = 'year=2026&month=11';

type Address = ['GET' | 'PUT', string];

const ACCESS = '/admin/dashboard/access';

/** The address groups after `access`, in the order of the table's columns. */
const COLUMNS: Address[][] = [
  // stats
  [['GET', '/admin/stats']],
  // overview, revenue-breakdown, GET targets
  [
    ['GET', `/admin/finance/overview?${MONTH}`],
    ['GET', `/admin/finance/revenue-breakdown?${RANGE}`],
    ['GET', '/admin/finance/targets'],
  ],
  // PUT targets
  [['PUT', '/admin/finance/targets']],
  // summary
  [['GET', `/admin/financials/summary?${RANGE}`]],
  // ownership-summary
  [['GET', `/admin/financials/ownership-summary?${MONTH}`]],
  // equity, trends
  [
    ['GET', `/admin/financials/equity?${RANGE}`],
    ['GET', '/admin/financials/trends'],
  ],
];

/** The sections by the numbers the table below uses for them. */
const SECTION: Record<number, DashboardSection> = {
  1: 'attention', 2: 'month', 3: 'trend', 4: 'breakdown', 5: 'ownership',
};

/** A month's targets, so that a save an account is allowed is not refused for its body. */
const TARGETS = { year: 2026, month: 11, revenueTargetCents: 30_000_000, netProfitTargetCents: 12_000_000, jobsTarget: 9 };

type Row = [
  caller: string,
  account: CastId | null,
  access: number,
  /** The sections the access address lists; null where it does not answer 200. */
  sections: number[] | null,
  stats: number,
  monthFigures: number,
  putTargets: number,
  summary: number,
  ownershipSummary: number,
  equityAndTrends: number,
];

// "linked" means linked to a current shareholder record. A role that is
// treated alike is still one row for each account here.
const TABLE: Row[] = [
  //                                                             access                   overview,                 owner-
  //                                                             and its                  breakdown,  PUT           ship     equity,
  // caller                                 account              sections          stats  GET targets targets summary summary trends
  ['no token',                              null,                401, null,            401,   401,    401,    401,    401,    401],
  ['owner',                                 'owner',             200, [1, 2, 3, 4, 5], 200,   200,    200,    200,    200,    200],
  ['ADMIN',                                 'admin',             200, [1, 2, 3, 4],    200,   200,    200,    200,    403,    403],
  ['COO',                                   'coo',               200, [1, 2, 3, 4],    200,   200,    200,    200,    403,    403],
  ['COO, linked',                           'cooLinked',         200, [1, 2, 3, 4, 5], 200,   200,    200,    200,    200,    403],
  ['FINANCIAL_MANAGER',                     'finance',           200, [2, 3, 4],       403,   200,    200,    200,    403,    403],
  ['SHAREHOLDER, linked',                   'shareholderLinked', 200, [5],             403,   403,    403,    403,    200,    403],
  ['SHAREHOLDER, not linked',               'shareholder',       200, [],              403,   403,    403,    403,    403,    403],
  ['SUPPORT',                               'support',           200, [1],             200,   403,    403,    403,    403,    403],
  ['CLEANING_SUPERVISOR',                   'supervisor',        200, [1],             200,   403,    403,    403,    403,    403],
  ['MARKETING',                             'marketing',         200, [1],             200,   403,    403,    403,    403,    403],
  ['SUPPORT, linked',                       'supportLinked',     200, [1, 5],          200,   403,    403,    403,    200,    403],
  ['token says ADMIN, record says SUPPORT', 'demoted',           200, [1],             200,   403,    403,    403,    403,    403],
  ['CUSTOMER',                              'customer',          403, null,            403,   403,    403,    403,    403,    403],
  ['CUSTOMER, linked',                      'customerLinked',    403, null,            403,   403,    403,    403,    403,    403],
  ['CREW',                                  'crew',              403, null,            403,   403,    403,    403,    403,    403],
  ['CREW, linked',                          'crewLinked',        403, null,            403,   403,    403,    403,    403,    403],
];

beforeEach(() => {
  resetDb();
  seedCast();
});

describe('the access table', () => {
  it('has a row for every account in the cast, and one for no sign-in', () => {
    const accounts = TABLE.map(([, account]) => account);

    expect(accounts.filter((account) => account !== null).sort()).toEqual([...CAST_IDS].sort());
    expect(accounts.filter((account) => account === null)).toHaveLength(1);
  });

  for (const [caller, account, access, sections, ...cells] of TABLE) {
    describe(caller, () => {
      const listed = sections && sections.map((n) => SECTION[n]);

      it(`GET ${ACCESS} answers ${access}${listed ? ` with sections ${JSON.stringify(listed)}` : ''}`, async () => {
        const res = await requestAs(account, 'GET', ACCESS);

        expect(res.statusCode).toBe(access);
        expect(res.statusCode === 200 ? res.json().access.sections : null).toEqual(listed);
      });

      COLUMNS.forEach((addresses, column) => {
        for (const [method, url] of addresses) {
          it(`${method} ${url} answers ${cells[column]}`, async () => {
            const res = await requestAs(account, method, url, method === 'PUT' ? TARGETS : undefined);

            expect(res.statusCode).toBe(cells[column]);
          });
        }
      });
    });
  }
});

describe('the routes the Dashboard does not use answer as they do today', () => {
  // Finance records: the owner and the ADMIN, FINANCIAL_MANAGER and SHAREHOLDER roles.
  // Declared payouts: of those, the owner and whoever is linked to a shareholder record.
  // Financials: the owner only.
  const UNCHANGED: Array<[url: string, owner: number, admin: number, shareholderLinked: number, shareholder: number, coo: number]> = [
    //                                                             SHAREHOLDER, SHAREHOLDER,
    // GET                                         owner  ADMIN    linked       not linked   COO
    [`/admin/finance/marketing?${RANGE}`,          200,   200,     200,         200,         403],
    ['/admin/finance/assets',                      200,   200,     200,         200,         403],
    ['/admin/finance/investments',                 200,   200,     200,         200,         403],
    [`/admin/finance/unreconciled?${RANGE}`,       200,   200,     200,         200,         403],
    ['/admin/finance/distributions',               200,   403,     200,         403,         403],
    ['/admin/financials/totals',                   200,   403,     403,         403,         403],
    ['/admin/financials/shareholders',             200,   403,     403,         403,         403],
  ];
  const ACCOUNTS: CastId[] = ['owner', 'admin', 'shareholderLinked', 'shareholder', 'coo'];

  for (const [url, ...statuses] of UNCHANGED) {
    describe(`GET ${url}`, () => {
      ACCOUNTS.forEach((account, i) => {
        it(`answers ${account} ${statuses[i]}`, async () => {
          expect((await requestAs(account, 'GET', url)).statusCode).toBe(statuses[i]);
        });
      });
    });
  }

  // The known gap, left for follow-up work: the Shareholder role still opens the
  // rest of /admin/finance, and a linked one the declared payouts.
  it('a linked SHAREHOLDER still reads marketing spend and declared payouts', async () => {
    const marketing = await requestAs('shareholderLinked', 'GET', `/admin/finance/marketing?${RANGE}`);
    const payouts = await requestAs('shareholderLinked', 'GET', '/admin/finance/distributions');

    expect(marketing.statusCode).toBe(200);
    expect(marketing.json()).toEqual({ spends: [] });
    expect(payouts.statusCode).toBe(200);
    expect(payouts.json()).toEqual({ distributions: [] });
  });

  it('an unlinked SHAREHOLDER and a COO are refused declared payouts, each by a different guard', async () => {
    const shareholder = await requestAs('shareholder', 'GET', '/admin/finance/distributions');
    const coo = await requestAs('coo', 'GET', '/admin/finance/distributions');

    expect(shareholder.statusCode).toBe(403);
    expect(shareholder.json()).toEqual({ error: 'shareholder access required' });
    expect(coo.statusCode).toBe(403);
    expect(coo.json()).toEqual({ error: 'finance access required' });
  });

  it('a COO is refused marketing spend and the equity overview', async () => {
    const marketing = await requestAs('coo', 'GET', `/admin/finance/marketing?${RANGE}`);
    const equity = await requestAs('coo', 'GET', `/admin/financials/equity?${RANGE}`);

    expect(marketing.statusCode).toBe(403);
    expect(marketing.json()).toEqual({ error: 'finance access required' });
    expect(equity.statusCode).toBe(403);
    expect(equity.json()).toEqual({ error: 'owner access required' });
  });
});
