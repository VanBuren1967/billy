import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

const ERROR_COPY: Record<string, { headline: string; body: string }> = {
  missing_code: {
    headline: 'That link looks incomplete.',
    body: 'The sign-in URL was missing its authorization code. Request a fresh link below.',
  },
  invalid_or_expired: {
    headline: 'That link has expired.',
    body: 'Sign-in links are good for one click, then they retire. Request a fresh one below.',
  },
  account_not_yet_linked: {
    headline: "Your account isn't fully set up yet.",
    body: "We received your sign-in but your athlete record hasn't been linked yet. Reach out to your coach if this persists.",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorInfo = error ? ERROR_COPY[error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-6 px-6">
      <p className="text-gold text-xs tracking-widest uppercase">Sign in</p>
      <h1 className="text-bone font-serif text-3xl">Enter your email.</h1>
      <p className="text-bone-muted text-sm">
        We&apos;ll send a one-tap sign-in link. No passwords.
      </p>

      {errorInfo && (
        <div
          role="alert"
          className="border-l-2 border-rose-400/70 bg-[#16140f] py-3 pl-4 pr-4"
        >
          <p className="text-rose-400/90 text-sm font-medium">{errorInfo.headline}</p>
          <p className="text-bone-muted mt-1 text-sm">{errorInfo.body}</p>
        </div>
      )}

      <LoginForm />
    </main>
  );
}
