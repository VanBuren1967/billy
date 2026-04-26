import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

const NAV_LINKS = [
  { href: '/coach', label: 'Dashboard' },
  { href: '/coach/athletes', label: 'Athletes' },
  { href: '/coach/requests', label: 'Requests' },
];

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-hairline flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-8">
          <p className="text-bone font-serif">
            Steele &amp; Co. <span className="text-gold">·</span> Coach
          </p>
          <nav className="hidden gap-6 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-bone-muted hover:text-bone focus-visible:outline-gold text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
