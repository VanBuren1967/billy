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

export const metadata: Metadata = {
  title: 'Steele & Co. — Powerlifting Coaching',
  description: 'A standard of excellence, under the bar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spectral.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
