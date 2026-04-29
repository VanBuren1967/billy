'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6 py-16">
      <p className="text-rose-400 text-xs tracking-widest uppercase">Something went wrong</p>
      <h1 className="text-bone font-serif text-5xl">We&rsquo;ll fix it.</h1>
      <p className="text-bone-muted max-w-prose text-base">
        An unexpected error interrupted that request. The incident has been reported.
      </p>
      {error.digest && (
        <p className="text-bone-faint text-xs tracking-widest uppercase">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={reset}
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-bone-muted hover:text-bone text-xs tracking-widest uppercase"
        >
          Home →
        </Link>
      </div>
    </main>
  );
}
