import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type RecentWorkoutLog = {
  id: string;
  programDayId: string;
  programDayName: string | null;
  weekNumber: number | null;
  dayNumber: number | null;
  status: 'in_progress' | 'completed' | 'skipped';
  completedAt: string | null;
  painNotes: string | null;
  generalNotes: string | null;
  updatedAt: string;
};

export async function listRecentWorkoutLogs(
  athleteId: string, limit = 10,
): Promise<RecentWorkoutLog[]> {
  await getCurrentCoach();
  const supabase = await createClient();

  const { data = [] } = await supabase
    .from('workout_logs')
    .select(`
      id, program_day_id, status, completed_at, pain_notes, general_notes, updated_at,
      program_days(week_number, day_number, name)
    `)
    .eq('athlete_id', athleteId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const day = row.program_days as unknown as
      { week_number: number; day_number: number; name: string } | null;
    return {
      id: row.id,
      programDayId: row.program_day_id,
      programDayName: day?.name ?? null,
      weekNumber: day?.week_number ?? null,
      dayNumber: day?.day_number ?? null,
      status: row.status as RecentWorkoutLog['status'],
      completedAt: row.completed_at,
      painNotes: row.pain_notes,
      generalNotes: row.general_notes,
      updatedAt: row.updated_at,
    };
  });
}
