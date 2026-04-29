import Link from 'next/link';
import { DirectInviteForm } from './form';

export const metadata = { title: 'Invite athlete' };

export default function InviteAthletePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <Link
        href="/coach/athletes"
        className="text-bone-muted hover:text-bone w-fit text-xs tracking-widest uppercase"
      >
        ← Back to roster
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Roster</p>
        <h1 className="text-bone font-serif text-4xl">Invite athlete</h1>
        <p className="text-bone-muted">
          Sends a magic-link invite. The athlete clicks the link in the email, signs in, and lands
          on their dashboard.
        </p>
      </header>
      <DirectInviteForm />
    </div>
  );
}
