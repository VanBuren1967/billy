import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Look up the coach+e2e@example.com coaches row; assumes ensureCoachAndLogin
 * has been called at least once to create the auth user + coaches row.
 */
export async function getE2eCoachId(): Promise<string> {
  const admin = adminClient();
  const { data: coach } = await admin
    .from('coaches')
    .select('id')
    .eq('email', 'coach+e2e@example.com')
    .single();
  if (!coach) throw new Error('coach+e2e@example.com coach not found — run ensureCoachAndLogin first');
  return coach.id;
}

export async function seedTemplate(coachId: string, name = 'E2E Template') {
  const admin = adminClient();
  const { data: tpl, error: tErr } = await admin.from('programs').insert({
    coach_id: coachId,
    name,
    block_type: 'strength',
    total_weeks: 4,
    is_template: true,
  }).select('id').single();
  if (tErr || !tpl) throw new Error(`seedTemplate failed: ${tErr?.message ?? 'no row'}`);

  const { data: day, error: dErr } = await admin.from('program_days').insert({
    program_id: tpl.id,
    week_number: 1,
    day_number: 1,
    name: 'Squat day',
  }).select('id').single();
  if (dErr || !day) throw new Error(`seedTemplate day failed: ${dErr?.message}`);

  const { error: eErr } = await admin.from('program_exercises').insert({
    program_day_id: day.id,
    position: 1,
    name: 'Squat',
    sets: 5,
    reps: '5',
    load_pct: 75,
  });
  if (eErr) throw new Error(`seedTemplate exercise failed: ${eErr.message}`);

  return { templateId: tpl.id };
}

export async function seedAthlete(coachId: string, name = 'E2E Athlete') {
  const admin = adminClient();
  const email = `athlete-${Date.now()}-${Math.floor(Math.random() * 1000)}@e2e.local`;
  const { data: a, error } = await admin.from('athletes').insert({
    coach_id: coachId,
    name,
    email,
    is_active: true,
  }).select('id').single();
  if (error || !a) throw new Error(`seedAthlete failed: ${error?.message}`);
  return { athleteId: a.id, athleteName: name, athleteEmail: email };
}

export async function seedProgram(coachId: string, opts: { name: string; isTemplate?: boolean }) {
  const admin = adminClient();
  const { data: p, error } = await admin.from('programs').insert({
    coach_id: coachId,
    name: opts.name,
    block_type: 'general',
    total_weeks: 1,
    is_template: opts.isTemplate ?? false,
  }).select('id').single();
  if (error || !p) throw new Error(`seedProgram failed: ${error?.message}`);
  return { programId: p.id };
}

/**
 * Programmatic assignment for tests that need a pre-assigned program. Mirrors
 * the deep-copy logic of assignProgramToAthlete via direct admin inserts.
 */
export async function assignTemplate(coachId: string, templateId: string, athleteId: string) {
  const admin = adminClient();
  const { data: tpl } = await admin.from('programs').select('*').eq('id', templateId).single();
  const { data: srcDays } = await admin.from('program_days').select('*').eq('program_id', templateId);
  const dayIds = (srcDays ?? []).map((d) => d.id);
  let srcExs: { id: string; program_day_id: string; position: number; name: string;
    sets: number; reps: string; load_pct: number | null; load_lbs: number | null;
    rpe: number | null; group_label: string | null; notes: string | null }[] = [];
  if (dayIds.length > 0) {
    const { data } = await admin.from('program_exercises').select('*').in('program_day_id', dayIds);
    srcExs = (data ?? []) as typeof srcExs;
  }

  const { data: newP } = await admin.from('programs').insert({
    coach_id: coachId,
    athlete_id: athleteId,
    name: `${tpl!.name} — assigned`,
    block_type: tpl!.block_type,
    total_weeks: tpl!.total_weeks,
    is_template: false,
  }).select('id').single();
  const newProgramId = newP!.id;

  const dayIdMap = new Map<string, string>();
  for (const d of srcDays ?? []) {
    const nd = await admin.from('program_days').insert({
      program_id: newProgramId,
      week_number: d.week_number,
      day_number: d.day_number,
      name: d.name,
      notes: d.notes,
    }).select('id').single();
    dayIdMap.set(d.id, nd.data!.id);
  }
  for (const e of srcExs) {
    await admin.from('program_exercises').insert({
      program_day_id: dayIdMap.get(e.program_day_id)!,
      position: e.position,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      load_pct: e.load_pct,
      load_lbs: e.load_lbs,
      rpe: e.rpe,
      group_label: e.group_label,
    });
  }

  return { newProgramId };
}
