import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../src/lib/auth';

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
    images: ['/logo.jpg'],
  },
  twitter: {
    card: 'summary',
    title: 'OnyxHawk — Premium cleaning in Nairobi',
    description: 'Vetted cleaning crews in Nairobi. Pay with M-Pesa, earn Hawk Points.',
    images: ['/logo.jpg'],
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
