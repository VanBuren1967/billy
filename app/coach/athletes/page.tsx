import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AthletesTable } from './athletes-table';

export const metadata = { title: 'Athletes' };

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export default async function AthletesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('athletes')
    .select('id, name, email, status, invited_at, accepted_at, created_at')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-bone font-serif text-3xl">Athletes</h1>
        <p className="text-gold">Could not load roster: {error.message}</p>
      </div>
    );
  }

  const athletes = (data ?? []) as Athlete[];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-gold text-xs tracking-widest uppercase">Roster</p>
          <h1 className="text-bone font-serif text-4xl">Athletes</h1>
          <p className="text-bone-muted">
            {athletes.length === 0
              ? 'No athletes yet.'
              : `${athletes.length} ${athletes.length === 1 ? 'athlete' : 'athletes'}.`}
          </p>
        </div>
        <Link
          href="/coach/athletes/invite"
          className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Invite athlete
        </Link>
      </header>

      <AthletesTable athletes={athletes} />
    </div>
  );
}
