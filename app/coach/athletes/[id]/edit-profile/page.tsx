import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Edit profile — Steele & Co.' };

export default async function EditProfilePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await getCurrentCoach();
  const supabase = await createClient();

  const { data: athlete } = await supabase.from('athletes')
    .select('*').eq('id', id).maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">{athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">Edit profile</h1>
      </header>
      <ProfileForm athleteId={athlete.id} initial={{
        weightClass: athlete.weight_class ?? '',
        rawOrEquipped: athlete.raw_or_equipped ?? '',
        currentSquatMax: athlete.current_squat_max ?? '',
        currentBenchMax: athlete.current_bench_max ?? '',
        currentDeadliftMax: athlete.current_deadlift_max ?? '',
        weakPoints: athlete.weak_points ?? '',
        injuryHistory: athlete.injury_history ?? '',
        experienceLevel: athlete.experience_level ?? '',
        goal: athlete.goal ?? '',
        meetDate: athlete.meet_date ?? '',
        meetName: athlete.meet_name ?? '',
        coachingType: athlete.coaching_type ?? '',
      }} />
    </main>
  );
}
