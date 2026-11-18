/**
 * The side menu's items, who sees which section, and the rule for which item
 * is the current page. app/(dashboard)/layout.tsx draws what this decides.
 */
export type NavItem = { href: string; label: string };
export type NavSection = { title: string; items: NavItem[] };

// There is no Dashboard: each account lands on its own first page (src/lib/landing.ts).
export const OPERATIONS: NavItem[] = [
  { href: '/projects', label: 'Projects' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/quotes', label: 'Quotes' },
];

/** Shown under Operations to everyone but the owner. */
export const JOB_REPORTS: NavItem = { href: '/job-reports', label: 'Job reports' };

/**
 * The month's targets, figures and where the money came from. The owner sees
 * all of it; an admin, the financial manager and a shareholder see the parts
 * the server gives them.
 */
export const INSIGHTS: NavItem = { href: '/insights', label: 'Insights' };

export const OWNER_FINANCE: NavItem[] = [
  INSIGHTS,
  // Per-job income and expenses. The address keeps its old name.
  { href: '/financials', label: 'Jobs & costs' },
  // Marketing, assets, investments and payouts.
  { href: '/finance', label: 'Company finance' },
  { href: '/rates', label: 'Quote rates' },
];

export const OWNER_GOVERNANCE: NavItem[] = [
  { href: '/equity', label: 'Ownership' },
  // Shareholder-only; the API refuses non-shareholders regardless.
  { href: '/documents', label: 'Documents' },
  { href: '/team', label: 'Team' },
];

/**
 * The machine register. Under Finance for everyone the server says may see it:
 * the owner, the admin, the financial manager, the COO and current shareholders.
 */
export const MACHINES: NavItem = { href: '/machines', label: 'Machines' };

// Owner, admins and marketing; the API refuses everyone else regardless.
export const WEBSITE: NavItem[] = [{ href: '/website-jobs', label: 'Website jobs' }];

/**
 * The menu for one signed-in account, grouped so it reads as sections rather
 * than one long list. `canViewMachines` is the server's answer: pass false
 * until it has answered, and when it could not be asked, so the item never
 * shows to someone the page would refuse. `canSeeInsights` comes from
 * src/lib/landing.ts.
 */
export function menuSections({
  isOwner, canPublishWebsite, canViewMachines, canSeeInsights,
}: {
  isOwner: boolean;
  canPublishWebsite: boolean;
  canViewMachines: boolean;
  canSeeInsights: boolean;
}): NavSection[] {
  const machines = canViewMachines ? [MACHINES] : [];
  // The rest of Finance is the owner's, so anyone else gets Insights and Machines at most.
  const staffFinance = [...(canSeeInsights ? [INSIGHTS] : []), ...machines];
  return [
    ...(isOwner
      ? [
          { title: 'Operations', items: OPERATIONS },
          { title: 'Finance', items: [...OWNER_FINANCE, ...machines] },
          { title: 'Governance', items: OWNER_GOVERNANCE },
        ]
      : [
          { title: 'Operations', items: [...OPERATIONS, JOB_REPORTS] },
          ...(staffFinance.length > 0 ? [{ title: 'Finance', items: staffFinance }] : []),
        ]),
    ...(canPublishWebsite ? [{ title: 'Website', items: WEBSITE }] : []),
  ];
}

/**
 * Is the page at `pathname` the menu item at `href`, or a page under it?
 * Whole path segments are compared, so `/financials` and `/financials/x`
 * belong to `/financials` and `/financials-old` does not. `/` is only itself.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
