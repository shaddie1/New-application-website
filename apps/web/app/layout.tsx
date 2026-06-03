import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../src/lib/auth';

export const metadata: Metadata = {
  title: 'OnyxHawk — Premium cleaning, on demand',
  description:
    'Book vetted cleaning crews in Nairobi. Deep cleans, move-outs, offices and more — pay with M-Pesa and earn Hawk Points.',
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
