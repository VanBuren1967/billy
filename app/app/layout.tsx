import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808]">
      <nav className="border-hairline-strong border-b">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-6 py-4">
          <Link href="/app" className="text-bone font-serif text-xl">
            Steele &amp; Co.
          </Link>
          <div className="flex items-center gap-6 text-xs uppercase tracking-widest">
            <Link href="/app" className="text-bone-muted hover:text-bone">Today</Link>
            <Link href="/app/program" className="text-bone-muted hover:text-bone">Program</Link>
            <Link href="/app/check-in" className="text-bone-muted hover:text-bone">Check-in</Link>
            <Link href="/auth/sign-out" className="text-bone-faint hover:text-bone-muted">Sign out</Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
