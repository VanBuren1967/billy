import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';

export type PainReport = {
  source: 'workout' | 'check-in';
  id: string;
  athleteId: string;
  athleteName: string;
  painNotes: string;
  at: string;
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function listPainReports(limit = 10): Promise<PainReport[]> {
  await getCurrentCoach();
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();

  const [workoutsRes, checkInsRes] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('id, athlete_id, pain_notes, updated_at, athletes(name)')
      .not('pain_notes', 'is', null)
      .neq('pain_notes', '')
      .gte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(limit),
    supabase
      .from('check_ins')
      .select('id, athlete_id, pain_notes, submitted_at, athletes(name)')
      .not('pain_notes', 'is', null)
      .neq('pain_notes', '')
      .gte('submitted_at', cutoff)
      .order('submitted_at', { ascending: false })
      .limit(limit),
  ]);

  const merged: PainReport[] = [];
  for (const w of workoutsRes.data ?? []) {
    const a = w.athletes as unknown as { name: string } | null;
    merged.push({
      source: 'workout',
      id: w.id,
      athleteId: w.athlete_id,
      athleteName: a?.name ?? '?',
      painNotes: w.pain_notes ?? '',
      at: w.updated_at,
    });
  }
  for (const c of checkInsRes.data ?? []) {
    const a = c.athletes as unknown as { name: string } | null;
    merged.push({
      source: 'check-in',
      id: c.id,
      athleteId: c.athlete_id,
      athleteName: a?.name ?? '?',
      painNotes: c.pain_notes ?? '',
      at: c.submitted_at,
    });
  }
  merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return merged.slice(0, limit);
}
