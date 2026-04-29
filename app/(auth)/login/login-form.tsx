'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

const initial: LoginState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);

  if (state.ok) {
    return (
      <p role="status" className="border-gold text-bone border-l-2 pl-3 text-sm">
        Link sent. Check your inbox (and spam).
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? 'email-error' : undefined}
        className="border-hairline-strong bg-ink-900 text-bone focus:border-gold border px-3 py-2 outline-none"
        placeholder="you@email.com"
      />
      {state.error && (
        <p id="email-error" role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="border-gold text-gold hover:bg-gold hover:text-ink-950 border px-4 py-2 text-xs tracking-widest uppercase transition disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send link'}
      </button>
    </form>
  );
}
