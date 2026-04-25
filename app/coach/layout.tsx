import { SignOutButton } from '@/components/sign-out-button';

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-hairline flex items-center justify-between border-b px-6 py-4">
        <p className="text-bone font-serif">
          Steele &amp; Co. <span className="text-gold">·</span> Coach
        </p>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
