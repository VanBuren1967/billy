import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

describe('swap_program_exercise_position + swap_program_day_position RPCs', () => {
  let programId: string;
  let dayId: string;
  let ex1Id: string;
  let ex2Id: string;
  let ex3Id: string;
  let day1Id: string;
  let day2Id: string;

  beforeAll(async () => {
    const email = `reorder-rpc-${Date.now()}@test.local`;
    const u = await admin.auth.admin.createUser({ email, email_confirm: true });
    const c = await admin.from('coaches').insert({
      auth_user_id: u.data.user!.id, display_name: 'C', email,
    }).select('id').single();
    const p = await admin.from('programs').insert({
      coach_id: c.data!.id, name: 'P', block_type: 'general', total_weeks: 1, version: 1,
    }).select('id').single();
    programId = p.data!.id;

    const d1 = await admin.from('program_days').insert({
      program_id: programId, week_number: 1, day_number: 1, name: 'Day 1',
    }).select('id').single();
    day1Id = d1.data!.id;
    dayId = day1Id;
    const d2 = await admin.from('program_days').insert({
      program_id: programId, week_number: 1, day_number: 2, name: 'Day 2',
    }).select('id').single();
    day2Id = d2.data!.id;

    const e1 = await admin.from('program_exercises').insert({
      program_day_id: dayId, position: 1, name: 'A', sets: 3, reps: '5',
    }).select('id').single();
    ex1Id = e1.data!.id;
    const e2 = await admin.from('program_exercises').insert({
      program_day_id: dayId, position: 2, name: 'B', sets: 3, reps: '5',
    }).select('id').single();
    ex2Id = e2.data!.id;
    const e3 = await admin.from('program_exercises').insert({
      program_day_id: dayId, position: 3, name: 'C', sets: 3, reps: '5',
    }).select('id').single();
    ex3Id = e3.data!.id;
  });

  it('exercise: moving the middle row up swaps it with the row above', async () => {
    const { data, error } = await admin.rpc('swap_program_exercise_position', {
      p_id: ex2Id, p_direction: 'up', p_program_version: 1,
    });
    expect(error).toBeNull();
    expect(data![0].noop).toBe(false);
    const { data: rows } = await admin.from('program_exercises')
      .select('id, name, position').eq('program_day_id', dayId).order('position');
    expect(rows!.map((r) => r.name)).toEqual(['B', 'A', 'C']);
    // Version bumped.
    const { data: prog } = await admin.from('programs').select('version').eq('id', programId).single();
    expect(prog!.version).toBe(2);
  });

  it('exercise: moving the bottom row down is a no-op', async () => {
    const before = await admin.from('program_exercises')
      .select('name, position').eq('program_day_id', dayId).order('position');
    const { data } = await admin.rpc('swap_program_exercise_position', {
      p_id: ex3Id, p_direction: 'down', p_program_version: 2,
    });
    expect(data![0].noop).toBe(true);
    const after = await admin.from('program_exercises')
      .select('name, position').eq('program_day_id', dayId).order('position');
    expect(after.data).toEqual(before.data);
  });

  it('exercise: not_found error for missing id', async () => {
    const { error } = await admin.rpc('swap_program_exercise_position', {
      p_id: '00000000-0000-0000-0000-000000000000', p_direction: 'up', p_program_version: 1,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe('P0002');
  });

  it('exercise: invalid direction is rejected', async () => {
    const { error } = await admin.rpc('swap_program_exercise_position', {
      p_id: ex1Id, p_direction: 'sideways', p_program_version: 1,
    });
    expect(error).toBeTruthy();
  });

  it('day: moving day 2 up to position 1 swaps cleanly', async () => {
    const { data, error } = await admin.rpc('swap_program_day_position', {
      p_id: day2Id, p_direction: 'up', p_program_version: 2,
    });
    expect(error).toBeNull();
    expect(data![0].noop).toBe(false);
    const { data: rows } = await admin.from('program_days')
      .select('id, day_number').eq('program_id', programId).order('day_number');
    expect(rows!.map((r) => r.id)).toEqual([day2Id, day1Id]);
  });
});
