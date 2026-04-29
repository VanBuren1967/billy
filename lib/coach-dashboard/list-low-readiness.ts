import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type LowReadinessEntry = {
  id: string;
  athleteId: string;
  athleteName: string;
  weekStarting: string;
  fatigue: number;
  soreness: number;
  motivation: number;
  submittedAt: string;
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function listLowReadinessCheckIns(limit = 10): Promise<LowReadinessEntry[]> {
  await getCurrentCoach();
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();

  // Pull recent check-ins; filter in app code (Postgres OR with RLS gets messy via PostgREST).
  const { data } = await supabase
    .from('check_ins')
    .select('id, athlete_id, week_starting, fatigue, soreness, motivation, submitted_at, athletes(name)')
    .gte('submitted_at', cutoff)
    .order('submitted_at', { ascending: false });

  const flagged: LowReadinessEntry[] = [];
  for (const r of data ?? []) {
    if (r.fatigue >= 8 || r.soreness >= 8 || r.motivation <= 3) {
      const a = r.athletes as unknown as { name: string } | null;
      flagged.push({
        id: r.id,
        athleteId: r.athlete_id,
        athleteName: a?.name ?? '?',
        weekStarting: r.week_starting,
        fatigue: r.fatigue,
        soreness: r.soreness,
        motivation: r.motivation,
        submittedAt: r.submitted_at,
      });
    }
  }
  return flagged.slice(0, limit);
}
