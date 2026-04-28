import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { AssignForm } from './assign-form';

export default async function AssignPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: program } = await supabase.from('programs')
    .select('id, name, total_weeks, is_template, coach_id')
    .eq('id', id).maybeSingle();
  if (!program || program.coach_id !== coach.id || !program.is_template) notFound();

  const { data: athletes = [] } = await supabase.from('athletes')
    .select('id, name')
    .eq('coach_id', coach.id)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Assign program</p>
        <h1 className="text-bone font-serif text-3xl">{program.name}</h1>
        <p className="text-bone-muted mt-2 text-sm">{program.total_weeks} weeks</p>
      </header>
      <AssignForm
        templateProgramId={program.id}
        athletes={(athletes ?? []).map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}
