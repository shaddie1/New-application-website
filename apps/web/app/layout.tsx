import './globals.css';
import type { Metadata } from 'next';
import { Raleway } from 'next/font/google';
import { AuthProvider } from '../src/lib/auth';

// Same face as the admin app. Self-hosted at build time by next/font, and it
// defines --font-sans, which the Tailwind `font-sans` stack starts with.
const raleway = Raleway({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://onyxhawkcleaningservice.com'),
  title: {
    default: 'OnyxHawk — Premium cleaning in Nairobi',
    template: '%s · OnyxHawk',
  },
  description:
    'Book vetted cleaning crews in Nairobi. Homes, offices, sofas, carpets and more — pay with M-Pesa and earn Hawk Points.',
  keywords: [
    'cleaning services Nairobi',
    'house cleaning Kenya',
    'office cleaning Nairobi',
    'sofa cleaning',
    'carpet cleaning',
    'fumigation',
    'M-Pesa',
  ],
  openGraph: {
    type: 'website',
    siteName: 'OnyxHawk',
    title: 'OnyxHawk — Premium cleaning in Nairobi',
    description:
      'Book vetted cleaning crews in Nairobi. Pay with M-Pesa, earn Hawk Points, and get before/after photos.',
    url: 'https://onyxhawkcleaningservice.com',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary',
    title: 'OnyxHawk — Premium cleaning in Nairobi',
    description: 'Vetted cleaning crews in Nairobi. Pay with M-Pesa, earn Hawk Points.',
    images: ['/logo.png'],
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={raleway.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
