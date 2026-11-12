import './globals.css';
import type { Metadata } from 'next';
import { DM_Serif_Display, Inter } from 'next/font/google';
import { ConfirmProvider } from '../src/components/ui/confirm-dialog';
import { AuthProvider } from '../src/lib/auth';

// Self-hosted at build time by next/font, so there is no render-blocking
// request to Google and no layout shift when the faces load. They define
// --font-sans and --font-serif, which the `font-sans` and `font-serif` stacks
// in tailwind.config.ts start with.
//
// Inter is the one sans for the whole admin because its digits can be set at
// full height and equal width, so figures line up in columns.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// The title face has a single weight, so serif titles are never bold.
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
    <html lang="en" className={`${inter.variable} ${dmSerif.variable}`}>
      <body>
        <AuthProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
