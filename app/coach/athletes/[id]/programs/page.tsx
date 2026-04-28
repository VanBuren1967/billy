import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { listPrograms } from '@/lib/programs/actions/list-programs';

export default async function AthleteProgramsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const includeArchived = sp.archived === '1';
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: athlete } = await supabase.from('athletes')
    .select('id, name, coach_id').eq('id', id).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) notFound();

  const programs = await listPrograms({ tab: 'programs', athleteId: id, includeArchived });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">{athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">Programs</h1>
      </header>
      <Link href={`?archived=${includeArchived ? '' : '1'}`} className="text-bone-faint hover:text-bone-muted self-start text-xs">
        {includeArchived ? '✓ Showing archived' : 'Show archived'}
      </Link>
      {programs.length === 0 ? (
        <p className="text-bone-muted">No programs assigned yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {programs.map((p) => (
            <li key={p.id} className="border-hairline-strong border p-4 hover:border-gold">
              <Link href={`/coach/programs/${p.id}/edit`} className="block">
                <h2 className="text-bone font-serif text-lg">{p.name}</h2>
                <p className="text-bone-muted mt-1 text-xs">
                  {p.blockType} · {p.totalWeeks} weeks · {p.startDate ?? 'no start date'}
                  {!p.isActive && ' · Archived'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
