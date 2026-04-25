'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

const initial: LoginState = { ok: false };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-6 px-6">
      <p className="text-xs uppercase tracking-widest text-gold">Sign in</p>
      <h1 className="font-serif text-3xl text-bone">Enter your email.</h1>
      <p className="text-sm text-bone-muted">
        We&apos;ll send a one-tap sign-in link. No passwords.
      </p>

      {state.ok ? (
        <p className="border-l-2 border-gold pl-3 text-sm text-bone">
          Link sent. Check your inbox (and spam).
        </p>
      ) : (
        <form action={formAction} className="flex w-full flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="border border-hairline-strong bg-ink-900 px-3 py-2 text-bone outline-none focus:border-gold"
            placeholder="you@email.com"
          />
          {state.error && <p className="text-sm text-red-400">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-widest text-gold transition hover:bg-gold hover:text-ink-950 disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send link'}
          </button>
        </form>
      )}
    </main>
  );
}
