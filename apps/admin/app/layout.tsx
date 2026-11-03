import './globals.css';
import type { Metadata } from 'next';
import { DM_Serif_Display, Raleway } from 'next/font/google';
import { Toaster } from 'sonner';
import { AuthProvider } from '../src/lib/auth';
import { ConfirmProvider } from '../src/components/ui/confirm-dialog';

// Self-hosted at build time by next/font, so there is no render-blocking
// request to Google and no layout shift when the faces load. They define
// --font-sans and --font-serif, which the Tailwind `font-sans` and
// `font-serif` stacks start with.
const raleway = Raleway({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// The headline face has a single weight, so serif headings stay unbolded.
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OnyxHawk Admin',
  description: 'Back-office for OnyxHawk cleaning operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${raleway.variable} ${dmSerif.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
        <Toaster className="print:hidden" position="bottom-right" closeButton toastOptions={{ className: 'font-sans' }} />
      </body>
    </html>
  );
}
