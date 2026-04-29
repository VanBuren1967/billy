import Link from 'next/link';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6 py-16">
      <p className="text-gold text-xs tracking-widest uppercase">404</p>
      <h1 className="text-bone font-serif text-5xl">This page is not here.</h1>
      <p className="text-bone-muted max-w-prose text-base">
        The link may be wrong, the page may have been moved, or the athlete may have unpublished
        their profile.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <Link
          href="/"
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase"
        >
          Home →
        </Link>
        <Link
          href="/team"
          className="text-bone-muted hover:text-bone text-xs tracking-widest uppercase"
        >
          The team →
        </Link>
      </div>
    </main>
  );
}
