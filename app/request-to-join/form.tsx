'use client';

import { useActionState } from 'react';
import { submitJoinRequest, type SubmitJoinRequestState } from './actions';

const initialState: SubmitJoinRequestState = { kind: 'idle' };

export function RequestToJoinForm() {
  const [state, action, pending] = useActionState(submitJoinRequest, initialState);
  const fieldErrors = state.kind === 'error' ? state.fields : undefined;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-bone-muted text-xs tracking-widest uppercase">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          aria-describedby={fieldErrors?.name ? 'name-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.name && (
          <p id="name-error" role="alert" className="text-gold text-xs">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-bone-muted text-xs tracking-widest uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.email && (
          <p id="email-error" role="alert" className="text-gold text-xs">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="message" className="text-bone-muted text-xs tracking-widest uppercase">
          Message <span className="lowercase">(optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          maxLength={2000}
          aria-describedby={fieldErrors?.message ? 'message-error' : undefined}
          className="border-hairline-strong bg-ink-900 text-bone focus:border-gold focus:outline-gold border px-4 py-3 focus:outline-2 focus:outline-offset-2"
        />
        {fieldErrors?.message && (
          <p id="message-error" role="alert" className="text-gold text-xs">
            {fieldErrors.message}
          </p>
        )}
      </div>

      {state.kind === 'error' && (
        <p role="status" className="text-gold text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {pending ? 'Submitting…' : 'Submit inquiry'}
      </button>
    </form>
  );
}
