import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope, Playfair_Display } from 'next/font/google';
import MissionHeader from '@/components/MissionHeader';
import './globals.css';

const display = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700'],
});

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Negotiation Room — Verifiable Negotiation Infrastructure',
  description: 'A verifiable room for private negotiation, conditional contracts, and attested fairness.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable} app-shell min-h-screen antialiased`}>
        <MissionHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      </body>
    </html>
  );
}
