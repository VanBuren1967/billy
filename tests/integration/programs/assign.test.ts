import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('assignProgramToAthlete — deep-copy semantics', () => {
  let coachId: string, athleteId: string, templateId: string;

  beforeAll(async () => {
    const email = `assign-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    coachId = c.data!.id;
    const a = await admin.from('athletes').insert({
      coach_id: coachId, name: 'Athlete A', email: `a-${Date.now()}@test.local`,
    }).select('id').single();
    athleteId = a.data!.id;
    const tpl = await admin.from('programs').insert({
      coach_id: coachId, name: 'Tpl', block_type: 'strength', total_weeks: 4, is_template: true,
    }).select('id').single();
    templateId = tpl.data!.id;
    const day = await admin.from('program_days').insert({
      program_id: templateId, week_number: 1, day_number: 1, name: 'Squat',
    }).select('id').single();
    await admin.from('program_exercises').insert({
      program_day_id: day.data!.id, position: 1, name: 'Squat', sets: 5, reps: '5',
    });
  });

  it('after deep-copy, edits to the assigned copy do not change the template', async () => {
    const { data: srcProg } = await admin.from('programs').select('*').eq('id', templateId).single();
    const { data: srcDays } = await admin.from('program_days').select('*').eq('program_id', templateId);
    const dayIds = srcDays!.map((d) => d.id);
    const { data: srcExs } = await admin.from('program_exercises').select('*').in('program_day_id', dayIds);

    const newProg = await admin.from('programs').insert({
      coach_id: coachId, athlete_id: athleteId,
      name: srcProg!.name + ' (copy)', block_type: srcProg!.block_type,
      total_weeks: srcProg!.total_weeks, is_template: false,
    }).select('id').single();
    const newProgId = newProg.data!.id;

    const dayIdMap = new Map<string, string>();
    for (const d of srcDays!) {
      const nd = await admin.from('program_days').insert({
        program_id: newProgId, week_number: d.week_number, day_number: d.day_number,
        name: d.name, notes: d.notes,
      }).select('id').single();
      dayIdMap.set(d.id, nd.data!.id);
    }
    for (const e of srcExs!) {
      await admin.from('program_exercises').insert({
        program_day_id: dayIdMap.get(e.program_day_id)!,
        position: e.position, name: e.name, sets: e.sets, reps: e.reps,
        load_pct: e.load_pct, load_lbs: e.load_lbs, rpe: e.rpe, group_label: e.group_label,
      });
    }

    const { data: copyEx } = await admin.from('program_exercises')
      .select('id, name, program_day_id, program_days(program_id)')
      .eq('name', 'Squat').limit(20);
    const copyExRow = copyEx!.find(
      (r) => (r.program_days as unknown as { program_id: string }).program_id === newProgId,
    )!;
    await admin.from('program_exercises').update({ name: 'Pause Squat (copy edit)' }).eq('id', copyExRow.id);

    const tplExs = await admin.from('program_exercises')
      .select('id, name, program_days(program_id)').eq('name', 'Squat');
    const tplStillSquat = tplExs.data!.some(
      (r) => (r.program_days as unknown as { program_id: string }).program_id === templateId,
    );
    expect(tplStillSquat).toBe(true);
  });
});
