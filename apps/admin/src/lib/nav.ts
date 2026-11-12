/**
 * The side menu's items and the rule for which one is the current page.
 * Who sees which group is decided in app/(dashboard)/layout.tsx.
 */
export type NavItem = { href: string; label: string };

export const OPERATIONS: NavItem[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/quotes', label: 'Quotes' },
];

/** Shown under Operations to everyone but the owner. */
export const JOB_REPORTS: NavItem = { href: '/job-reports', label: 'Job reports' };

export const OWNER_FINANCE: NavItem[] = [
  { href: '/insights', label: 'Insights' },
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

// Owner, admins and marketing; the API refuses everyone else regardless.
export const WEBSITE: NavItem[] = [{ href: '/website-jobs', label: 'Website jobs' }];

/**
 * Is the page at `pathname` the menu item at `href`, or a page under it?
 * Whole path segments are compared, so `/financials` and `/financials/x`
 * belong to `/financials` and `/financials-old` does not. `/` is only itself.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
