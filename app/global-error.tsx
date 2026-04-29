'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

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
    <html lang="en">
      <body
        style={{
          background: '#0c0c0c',
          color: '#e8e3d8',
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <p
            style={{
              color: '#f43f5e',
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}
          >
            Critical error
          </p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 400, marginBottom: '1rem' }}>
            We&rsquo;ll fix it.
          </h1>
          <p style={{ color: '#a8a29e', marginBottom: '2rem' }}>
            The application failed to render. The incident has been reported.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: '1px solid #c9a96e',
              color: '#c9a96e',
              background: 'transparent',
              padding: '0.75rem 2rem',
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
