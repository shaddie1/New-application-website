import './globals.css';
import type { Metadata } from 'next';
import { DM_Serif_Display, Raleway } from 'next/font/google';
import { AuthProvider } from '../src/lib/auth';

// Same faces as the admin app. Self-hosted at build time by next/font, they
// define --font-sans and --font-serif, which the Tailwind `font-sans` and
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
    <html lang="en" className={`${raleway.variable} ${dmSerif.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
