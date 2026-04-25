import { SignOutButton } from '@/components/sign-out-button';

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <p className="font-serif text-bone">Steele &amp; Co.</p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
