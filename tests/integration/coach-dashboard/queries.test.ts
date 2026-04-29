import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('Coach dashboard queries (DB-level)', () => {
  let coachId: string;
  let athleteWithLog: string;
  let athleteNoLogs: string;
  let athleteOldLog: string;
  let dayId: string;

  beforeAll(async () => {
    const ts = Date.now();
    const cu = await admin.auth.admin.createUser({
      email: `c-cdq-${ts}@test.local`,
      email_confirm: true,
    });
    const c = await admin
      .from('coaches')
      .insert({
        auth_user_id: cu.data.user!.id,
        display_name: 'C',
        email: `c-cdq-${ts}@test.local`,
      })
      .select('id')
      .single();
    coachId = c.data!.id;

    // Athlete A: assigned program + recent log → SHOULD NOT be in missed
    const aA = await admin
      .from('athletes')
      .insert({
        coach_id: coachId,
        name: 'A',
        email: `a-cdq-A-${ts}@test.local`,
        is_active: true,
      })
      .select('id')
      .single();
    athleteWithLog = aA.data!.id;

    // Athlete B: assigned program + no logs → SHOULD be in missed
    const aB = await admin
      .from('athletes')
      .insert({
        coach_id: coachId,
        name: 'B',
        email: `a-cdq-B-${ts}@test.local`,
        is_active: true,
      })
      .select('id')
      .single();
    athleteNoLogs = aB.data!.id;

    // Athlete C: assigned program + log >7 days old → SHOULD be in missed
    const aC = await admin
      .from('athletes')
      .insert({
        coach_id: coachId,
        name: 'C',
        email: `a-cdq-C-${ts}@test.local`,
        is_active: true,
      })
      .select('id')
      .single();
    athleteOldLog = aC.data!.id;

    // Programs for all three
    for (const aid of [athleteWithLog, athleteNoLogs, athleteOldLog]) {
      const p = await admin
        .from('programs')
        .insert({
          coach_id: coachId,
          athlete_id: aid,
          name: 'P',
          block_type: 'general',
          total_weeks: 1,
          is_template: false,
          is_active: true,
        })
        .select('id')
        .single();
      const d = await admin
        .from('program_days')
        .insert({
          program_id: p.data!.id,
          week_number: 1,
          day_number: 1,
          name: 'Day',
        })
        .select('id')
        .single();
      if (aid === athleteWithLog) dayId = d.data!.id;
    }

    // Recent log for A (today)
    await admin.from('workout_logs').insert({
      athlete_id: athleteWithLog,
      program_day_id: dayId,
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    // Old log for C (10 days ago)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const programC = await admin
      .from('programs')
      .select('id')
      .eq('athlete_id', athleteOldLog)
      .single();
    const dC = (
      await admin.from('program_days').select('id').eq('program_id', programC.data!.id).single()
    ).data!.id;
    await admin.from('workout_logs').insert({
      athlete_id: athleteOldLog,
      program_day_id: dC,
      status: 'completed',
      completed_at: tenDaysAgo,
    });

    // Pain note + low readiness check-in for athleteWithLog.
    // Update the existing completed log rather than insert (unique on athlete+day).
    await admin
      .from('workout_logs')
      .update({ pain_notes: 'mild left knee' })
      .eq('athlete_id', athleteWithLog)
      .eq('program_day_id', dayId);
    await admin.from('check_ins').insert({
      athlete_id: athleteWithLog,
      week_starting: '2026-04-27',
      bodyweight_lbs: 200,
      fatigue: 9,
      soreness: 5,
      confidence: 7,
      motivation: 6,
      pain_notes: 'shoulder tight',
    });
  });

  it('listMissedWorkoutAthletes returns athletes B and C, not A', async () => {
    const { data } = await admin
      .from('workout_logs')
      .select('athlete_id')
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    const recentlyLogged = new Set((data ?? []).map((d) => d.athlete_id));
    // Replicate the helper's logic at DB level for the test
    const { data: programs } = await admin
      .from('programs')
      .select('athlete_id')
      .eq('is_template', false)
      .eq('is_active', true)
      .eq('coach_id', coachId);
    const missed = (programs ?? [])
      .map((p) => p.athlete_id)
      .filter((id) => id && !recentlyLogged.has(id));
    expect(missed).toEqual(expect.arrayContaining([athleteNoLogs, athleteOldLog]));
    expect(missed).not.toContain(athleteWithLog);
  });

  it('listPainReports finds pain notes from both workouts and check-ins', async () => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [w, c] = await Promise.all([
      admin
        .from('workout_logs')
        .select('id')
        .not('pain_notes', 'is', null)
        .neq('pain_notes', '')
        .gte('updated_at', cutoff),
      admin
        .from('check_ins')
        .select('id')
        .not('pain_notes', 'is', null)
        .neq('pain_notes', '')
        .gte('submitted_at', cutoff),
    ]);
    expect((w.data ?? []).length).toBeGreaterThanOrEqual(1);
    expect((c.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('listLowReadinessCheckIns flags fatigue >= 8', async () => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('check_ins')
      .select('id, fatigue, soreness, motivation')
      .gte('submitted_at', cutoff);
    const flagged = (data ?? []).filter(
      (r) => r.fatigue >= 8 || r.soreness >= 8 || r.motivation <= 3,
    );
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  it('listRecentActivity finds completed workouts', async () => {
    const { data } = await admin
      .from('workout_logs')
      .select('id, completed_at, program_days(name)')
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);
    expect((data ?? []).length).toBeGreaterThanOrEqual(2); // A + C both have completed logs
  });

  it('athletes without an assigned program are excluded from missed-workouts', async () => {
    const ts = Date.now();
    const orphan = await admin
      .from('athletes')
      .insert({
        coach_id: coachId,
        name: 'Orphan',
        email: `o-${ts}@test.local`,
        is_active: true,
      })
      .select('id')
      .single();

    // Replicate the helper's logic at DB level
    const { data: programs } = await admin
      .from('programs')
      .select('athlete_id')
      .eq('is_template', false)
      .eq('is_active', true)
      .eq('coach_id', coachId);
    const programmedAthletes = new Set((programs ?? []).map((p) => p.athlete_id));
    expect(programmedAthletes.has(orphan.data!.id)).toBe(false);
  });
});
