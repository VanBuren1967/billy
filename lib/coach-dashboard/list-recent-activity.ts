import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type RecentActivityEntry = {
  id: string;
  athleteId: string;
  athleteName: string;
  programDayName: string | null;
  weekNumber: number | null;
  dayNumber: number | null;
  completedAt: string;
};

export async function listRecentActivity(limit = 10): Promise<RecentActivityEntry[]> {
  await getCurrentCoach();
  const supabase = await createClient();

  const { data } = await supabase
    .from('workout_logs')
    .select(`
      id, athlete_id, completed_at,
      athletes(name),
      program_days(week_number, day_number, name)
    `)
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => {
    const a = r.athletes as unknown as { name: string } | null;
    const d = r.program_days as unknown as
      | { week_number: number; day_number: number; name: string }
      | null;
    return {
      id: r.id,
      athleteId: r.athlete_id,
      athleteName: a?.name ?? '?',
      programDayName: d?.name ?? null,
      weekNumber: d?.week_number ?? null,
      dayNumber: d?.day_number ?? null,
      completedAt: r.completed_at!,
    };
  });
}
