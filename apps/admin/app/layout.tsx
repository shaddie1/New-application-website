import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../src/lib/auth';

export const metadata: Metadata = {
  title: 'OnyxHawk Admin',
  description: 'Back-office for OnyxHawk cleaning operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
