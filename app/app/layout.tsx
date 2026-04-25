import { SignOutButton } from '@/components/sign-out-button';

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-hairline flex items-center justify-between border-b px-6 py-4">
        <p className="text-bone font-serif">Steele &amp; Co.</p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
