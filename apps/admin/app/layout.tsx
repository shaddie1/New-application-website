import './globals.css';
import type { Metadata } from 'next';
import { Raleway } from 'next/font/google';
import { AuthProvider } from '../src/lib/auth';

// Self-hosted at build time by next/font, so there is no render-blocking
// request to Google and no layout shift when the face loads.
const raleway = Raleway({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-raleway',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OnyxHawk Admin',
  description: 'Back-office for OnyxHawk cleaning operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={raleway.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
