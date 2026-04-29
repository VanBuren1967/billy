import type { Metadata } from 'next';
import { Inter, Spectral } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const spectral = Spectral({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Steele & Co. — Powerlifting Coaching',
    template: '%s · Steele & Co.',
  },
  description: 'A standard of excellence, under the bar.',
  openGraph: {
    type: 'website',
    siteName: 'Steele & Co.',
    title: 'Steele & Co. — Powerlifting Coaching',
    description: 'A standard of excellence, under the bar.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Steele & Co. — Powerlifting Coaching',
    description: 'A standard of excellence, under the bar.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spectral.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
