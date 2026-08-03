import { Footer } from '../../src/components/Footer';
import { SiteHeader } from '../../src/components/SiteHeader';
import { FloatingActions } from '../../src/components/marketing/FloatingActions';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // The marketing site runs on charcoal; the signed-in app keeps the light
    // theme, so the dark palette is scoped here rather than set on <body>.
    <div className="flex min-h-screen flex-col bg-cream text-charcoal">
      <SiteHeader />
      {/* Bottom padding clears the mobile action bar. */}
      <main className="flex-1 pb-24 sm:pb-0">{children}</main>
      <Footer />
      <FloatingActions />
    </div>
  );
}
