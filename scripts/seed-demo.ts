import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Load .env.local
const envPath = join(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.SEED_COACH_EMAIL ?? 'van@cfbcllc.com';

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function main() {
  console.log(`Seeding for ${EMAIL}…`);

  // 1. Auth user
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = existing?.users.find((u) => u.email === EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    if (error) throw error;
    user = data.user!;
    console.log(`  + created auth user`);
  } else {
    console.log(`  · auth user exists`);
  }

  // 2. Coach
  let { data: coach } = await admin.from('coaches').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!coach) {
    const { data, error } = await admin.from('coaches').insert({
      auth_user_id: user.id, display_name: 'Van', email: EMAIL,
    }).select('id').single();
    if (error) throw error;
    coach = data;
    console.log(`  + created coach`);
  } else {
    console.log(`  · coach exists`);
  }
  const coachId = coach!.id;

  // 3. Athletes — each gets an auth user so they can sign in and see /app.
  const athleteSeeds = [
    { name: 'Alex Reyes', email: 'alex@demo.local' },
    { name: 'Morgan Chen', email: 'morgan@demo.local' },
    { name: 'Riley Park', email: 'riley@demo.local' },
  ];
  const athleteIds: { id: string; name: string }[] = [];
  const allUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const a of athleteSeeds) {
    // Auth user
    let athleteAuth = allUsers.data?.users.find((u) => u.email === a.email);
    if (!athleteAuth) {
      const { data, error } = await admin.auth.admin.createUser({ email: a.email, email_confirm: true });
      if (error) throw error;
      athleteAuth = data.user!;
    }
    // Athletes row (link auth_user_id if missing)
    const { data: ex } = await admin.from('athletes').select('id, name, auth_user_id').eq('coach_id', coachId).eq('email', a.email).maybeSingle();
    if (ex) {
      if (!ex.auth_user_id) {
        await admin.from('athletes').update({ auth_user_id: athleteAuth.id }).eq('id', ex.id);
      }
      athleteIds.push({ id: ex.id, name: ex.name });
      continue;
    }
    const { data } = await admin.from('athletes').insert({
      coach_id: coachId, auth_user_id: athleteAuth.id, name: a.name, email: a.email, is_active: true,
    }).select('id, name').single();
    athleteIds.push({ id: data!.id, name: data!.name });
  }
  console.log(`  · ${athleteIds.length} athletes ready (with auth users)`);

  // 4. Template: 5/3/1 Strength Block (4 weeks)
  const { data: existingTpl } = await admin.from('programs')
    .select('id').eq('coach_id', coachId).eq('name', '5/3/1 Strength Block').maybeSingle();
  if (!existingTpl) {
    const { data: tpl } = await admin.from('programs').insert({
      coach_id: coachId, name: '5/3/1 Strength Block',
      block_type: 'strength', total_weeks: 4, is_template: true,
      notes: 'Classic 5/3/1 prescription with main lift + accessories. Designed for intermediate-to-advanced lifters.',
    }).select('id').single();
    const tplId = tpl!.id;

    // Week 1: 65/75/85 (5+ sets)
    // Week 2: 70/80/90 (3+ sets)
    // Week 3: 75/85/95 (5/3/1+)
    // Week 4: 40/50/60 (deload)
    const weekPcts = [
      { w: 1, reps: ['5', '5', '5+'], pcts: [65, 75, 85] },
      { w: 2, reps: ['3', '3', '3+'], pcts: [70, 80, 90] },
      { w: 3, reps: ['5', '3', '1+'], pcts: [75, 85, 95] },
      { w: 4, reps: ['5', '5', '5'], pcts: [40, 50, 60] },
    ];
    const lifts = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press'];

    for (const { w, reps, pcts } of weekPcts) {
      for (let dayN = 0; dayN < lifts.length; dayN++) {
        const lift = lifts[dayN]!;
        const { data: day } = await admin.from('program_days').insert({
          program_id: tplId, week_number: w, day_number: dayN + 1,
          name: lift, notes: w === 4 ? 'Deload week — focus on recovery' : null,
        }).select('id').single();
        const dayId = day!.id;
        let pos = 1;
        // Main lift: 3 sets at the prescribed pcts/reps
        for (let s = 0; s < 3; s++) {
          await admin.from('program_exercises').insert({
            program_day_id: dayId, position: pos++,
            name: lift, sets: 1, reps: reps[s]!, load_pct: pcts[s], rpe: null,
          });
        }
        // A1/A2 superset accessory
        const accessory1 = lift === 'Squat' ? 'Front Squat' : lift === 'Bench Press' ? 'Incline DB Press' : lift === 'Deadlift' ? 'RDL' : 'Push Press';
        const accessory2 = lift === 'Squat' ? 'Walking Lunge' : lift === 'Bench Press' ? 'Pendlay Row' : lift === 'Deadlift' ? 'Pull-up' : 'Lateral Raise';
        await admin.from('program_exercises').insert({
          program_day_id: dayId, position: pos++,
          name: accessory1, sets: 4, reps: '8', rpe: 7, group_label: 'A',
        });
        await admin.from('program_exercises').insert({
          program_day_id: dayId, position: pos++,
          name: accessory2, sets: 4, reps: '10', rpe: 7, group_label: 'A',
        });
        // Solo accessory
        const solo = lift === 'Squat' ? 'Leg Curl' : lift === 'Bench Press' ? 'Tricep Pushdown' : lift === 'Deadlift' ? 'Hammer Curl' : 'Face Pull';
        await admin.from('program_exercises').insert({
          program_day_id: dayId, position: pos++,
          name: solo, sets: 3, reps: '12', rpe: 8,
        });
      }
    }
    console.log(`  + created template '5/3/1 Strength Block' (4 weeks × 4 days)`);
  } else {
    console.log(`  · template exists`);
  }

  // 5. Assigned program for Alex (hypertrophy block, 2 weeks × 3 days)
  const alex = athleteIds[0]!;
  const { data: existingAssigned } = await admin.from('programs')
    .select('id').eq('coach_id', coachId).eq('athlete_id', alex.id).eq('name', 'Hypertrophy Block — Alex').maybeSingle();
  if (!existingAssigned) {
    // Compute next Monday as start_date
    const d = new Date();
    const offset = (1 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + offset);
    const startDate = d.toISOString().slice(0, 10);
    const endDateD = new Date(`${startDate}T00:00:00Z`);
    endDateD.setUTCDate(endDateD.getUTCDate() + 14 - 1);
    const endDate = endDateD.toISOString().slice(0, 10);

    const { data: prog } = await admin.from('programs').insert({
      coach_id: coachId, athlete_id: alex.id,
      name: 'Hypertrophy Block — Alex',
      block_type: 'hypertrophy', total_weeks: 2, start_date: startDate, end_date: endDate,
      is_template: false,
      notes: 'Two-week hypertrophy block targeting weak point on bench (lockout). Volume-focused, RPE 7-8.',
    }).select('id').single();
    const progId = prog!.id;

    type Row = { name: string; sets: number; reps: string; load_pct?: number | null; load_lbs?: number | null; rpe?: number | null; group_label?: string | null };
    const days: { name: string; rows: Row[] }[] = [
      { name: 'Push (chest + shoulders + tris)', rows: [
        { name: 'Bench Press', sets: 4, reps: '8', load_pct: 70, rpe: 7 },
        { name: 'Incline DB Press', sets: 3, reps: '10', load_lbs: 60, rpe: 8, group_label: 'A' },
        { name: 'Lateral Raise', sets: 3, reps: '12', load_lbs: 15, rpe: 9, group_label: 'A' },
        { name: 'Cable Fly', sets: 3, reps: '15', rpe: 9 },
        { name: 'Tricep Pushdown', sets: 3, reps: 'AMRAP @ RPE 9', rpe: 9 },
      ]},
      { name: 'Pull (back + bis)', rows: [
        { name: 'Pendlay Row', sets: 4, reps: '8', load_pct: 70, rpe: 7 },
        { name: 'Pull-up', sets: 3, reps: 'AMRAP', rpe: 9, group_label: 'A' },
        { name: 'Hammer Curl', sets: 3, reps: '10', load_lbs: 25, rpe: 8, group_label: 'A' },
        { name: 'Face Pull', sets: 3, reps: '15', rpe: 8 },
      ]},
      { name: 'Legs (squat + posterior)', rows: [
        { name: 'Squat', sets: 4, reps: '6', load_pct: 75, rpe: 7 },
        { name: 'RDL', sets: 3, reps: '8', load_lbs: 225, rpe: 8 },
        { name: 'Walking Lunge', sets: 3, reps: '10/leg', load_lbs: 30, rpe: 8 },
        { name: 'Leg Curl', sets: 3, reps: '12', rpe: 9 },
        { name: 'Calf Raise', sets: 4, reps: '15', rpe: 9 },
      ]},
    ];

    for (let w = 1; w <= 2; w++) {
      for (let dn = 0; dn < days.length; dn++) {
        const d = days[dn]!;
        const { data: dayRow } = await admin.from('program_days').insert({
          program_id: progId, week_number: w, day_number: dn + 1, name: d.name,
        }).select('id').single();
        let pos = 1;
        for (const r of d.rows) {
          // Bump load 5lb / 2.5% in week 2 to show progression
          const bump = w === 2 ? (r.load_lbs ? 5 : r.load_pct ? 2.5 : 0) : 0;
          await admin.from('program_exercises').insert({
            program_day_id: dayRow!.id, position: pos++,
            name: r.name, sets: r.sets, reps: r.reps,
            load_pct: r.load_pct ? r.load_pct + bump : null,
            load_lbs: r.load_lbs ? r.load_lbs + bump : null,
            rpe: r.rpe ?? null, group_label: r.group_label ?? null,
          });
        }
      }
    }
    console.log(`  + created assigned program 'Hypertrophy Block — Alex' (2 weeks × 3 days)`);
  } else {
    console.log(`  · assigned program exists`);
  }

  console.log(`Done.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
