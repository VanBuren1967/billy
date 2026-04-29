import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { computeWeekStarting } from './week-starting';

export type CheckInRow = {
  id: string;
  weekStarting: string;
  bodyweightLbs: number;
  fatigue: number;
  soreness: number;
  confidence: number;
  motivation: number;
  meetReadiness: number | null;
  painNotes: string | null;
  comments: string | null;
  submittedAt: string;
  updatedAt: string;
};

export async function getCurrentWeekCheckIn(): Promise<{ checkIn: CheckInRow | null; weekStarting: string }> {
  const athlete = await getCurrentAthlete();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekStarting = computeWeekStarting(today);

  const { data } = await supabase
    .from('check_ins')
    .select('id, week_starting, bodyweight_lbs, fatigue, soreness, confidence, motivation, meet_readiness, pain_notes, comments, submitted_at, updated_at')
    .eq('athlete_id', athlete.id)
    .eq('week_starting', weekStarting)
    .maybeSingle();

  if (!data) return { checkIn: null, weekStarting };
  return {
    checkIn: {
      id: data.id, weekStarting: data.week_starting,
      bodyweightLbs: data.bodyweight_lbs, fatigue: data.fatigue, soreness: data.soreness,
      confidence: data.confidence, motivation: data.motivation,
      meetReadiness: data.meet_readiness, painNotes: data.pain_notes, comments: data.comments,
      submittedAt: data.submitted_at, updatedAt: data.updated_at,
    },
    weekStarting,
  };
}
