import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '@/lib/programs/get-current-coach';
import type { CheckInRow } from './get-current-week';

export async function listRecentCheckIns(athleteId: string, limit = 6): Promise<CheckInRow[]> {
  await getCurrentCoach();
  const supabase = await createClient();
  const { data = [] } = await supabase
    .from('check_ins')
    .select('id, week_starting, bodyweight_lbs, fatigue, soreness, confidence, motivation, meet_readiness, pain_notes, comments, submitted_at, updated_at')
    .eq('athlete_id', athleteId)
    .order('week_starting', { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    id: d.id, weekStarting: d.week_starting,
    bodyweightLbs: d.bodyweight_lbs, fatigue: d.fatigue, soreness: d.soreness,
    confidence: d.confidence, motivation: d.motivation,
    meetReadiness: d.meet_readiness, painNotes: d.pain_notes, comments: d.comments,
    submittedAt: d.submitted_at, updatedAt: d.updated_at,
  }));
}
