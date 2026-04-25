import Link from 'next/link';

export function PublicNav() {
  return (
    <header className="border-hairline border-b">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-bone hover:text-gold focus-visible:outline-gold font-serif transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Steele &amp; Co.
        </Link>
        <nav className="flex items-center gap-6 text-xs tracking-widest uppercase">
          <Link href="/about" className="text-bone-muted hover:text-bone transition">
            About
          </Link>
          <Link href="/pricing" className="text-bone-muted hover:text-bone transition">
            Pricing
          </Link>
          <Link href="/faq" className="text-bone-muted hover:text-bone transition">
            FAQ
          </Link>
          <Link href="/login" className="text-bone-muted hover:text-bone transition">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
