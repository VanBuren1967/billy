import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type MissedWorkoutAthlete = {
  athleteId: string;
  athleteName: string;
  lastLoggedAt: string | null;
};

/**
 * Returns athletes who have an assigned active program and either:
 * - their last completed workout_log is >7 days old, OR
 * - they have no completed workout_logs at all
 *
 * Coach RLS scopes to their own athletes.
 */
export async function listMissedWorkoutAthletes(): Promise<MissedWorkoutAthlete[]> {
  await getCurrentCoach();
  const supabase = await createClient();

  // Athletes with at least one active assigned program
  const { data: programs } = await supabase
    .from('programs')
    .select('athlete_id, athletes(id, name)')
    .eq('is_template', false)
    .eq('is_active', true)
    .not('athlete_id', 'is', null);

  const athletes = new Map<string, { id: string; name: string }>();
  for (const p of programs ?? []) {
    const a = p.athletes as unknown as { id: string; name: string } | null;
    if (a && p.athlete_id) athletes.set(p.athlete_id, a);
  }

  if (athletes.size === 0) return [];

  // Latest completed workout per athlete
  const athleteIds = Array.from(athletes.keys());
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('athlete_id, completed_at')
    .in('athlete_id', athleteIds)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  const lastByAthlete = new Map<string, string>();
  for (const l of logs ?? []) {
    if (l.athlete_id && l.completed_at && !lastByAthlete.has(l.athlete_id)) {
      lastByAthlete.set(l.athlete_id, l.completed_at);
    }
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const result: MissedWorkoutAthlete[] = [];
  for (const [athleteId, athlete] of athletes) {
    const last = lastByAthlete.get(athleteId);
    if (!last) {
      result.push({ athleteId, athleteName: athlete.name, lastLoggedAt: null });
      continue;
    }
    const lastTime = new Date(last).getTime();
    if (lastTime < sevenDaysAgo) {
      result.push({ athleteId, athleteName: athlete.name, lastLoggedAt: last });
    }
  }
  return result.sort((a, b) => {
    const aT = a.lastLoggedAt ? new Date(a.lastLoggedAt).getTime() : 0;
    const bT = b.lastLoggedAt ? new Date(b.lastLoggedAt).getTime() : 0;
    return aT - bT;
  });
}
