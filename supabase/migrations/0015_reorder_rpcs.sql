-- Polish: atomic reorder for program_exercises + program_days.
--
-- Old TS code did a 3-step swap via a temp negative position across
-- THREE separate Supabase round-trips. If the process died between
-- updates 1 and 3 a row sat at a negative position permanently. The
-- day-reorder variant was actually broken outright — the temp
-- negative day_number violates the check constraint
-- `day_number > 0`.
--
-- Fix: convert both unique guards to DEFERRABLE so the swap can run
-- as a single UPDATE inside a function body. Single statement +
-- single transaction = atomic. SET CONSTRAINTS ALL DEFERRED inside
-- the function defers the per-row uniqueness check until end of
-- transaction; the final state (rows permuted) passes uniqueness.
--
-- security invoker: RLS still applies; the caller's privileges decide
-- which rows are visible/updatable.

-- 1. Convert program_exercises unique INDEX → DEFERRABLE unique CONSTRAINT
--    (indexes cannot be deferrable; constraints can).
drop index if exists public.program_exercises_day_position_uniq;
alter table public.program_exercises
  add constraint program_exercises_day_position_uniq
  unique (program_day_id, position) deferrable initially immediate;

-- 2. Make program_days unique constraint DEFERRABLE.
alter table public.program_days
  drop constraint if exists program_days_program_id_week_number_day_number_key;
alter table public.program_days
  add constraint program_days_program_id_week_number_day_number_key
  unique (program_id, week_number, day_number) deferrable initially immediate;

-- 3. Atomic swap functions.
create or replace function public.swap_program_exercise_position(
  p_id uuid,
  p_direction text,
  p_program_version integer
) returns table(program_id uuid, noop boolean)
language plpgsql
security invoker
as $$
declare
  v_position integer;
  v_program_day_id uuid;
  v_program_id uuid;
  v_neighbor_id uuid;
  v_neighbor_position integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'invalid direction: %', p_direction using errcode = '22023';
  end if;

  select pe.position, pe.program_day_id, pd.program_id
    into v_position, v_program_day_id, v_program_id
    from public.program_exercises pe
    join public.program_days pd on pd.id = pe.program_day_id
    where pe.id = p_id;

  if v_program_id is null then
    raise exception 'exercise not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select pe2.id, pe2.position
      into v_neighbor_id, v_neighbor_position
      from public.program_exercises pe2
      where pe2.program_day_id = v_program_day_id and pe2.position < v_position
      order by pe2.position desc
      limit 1;
  else
    select pe2.id, pe2.position
      into v_neighbor_id, v_neighbor_position
      from public.program_exercises pe2
      where pe2.program_day_id = v_program_day_id and pe2.position > v_position
      order by pe2.position asc
      limit 1;
  end if;

  if v_neighbor_id is null then
    return query select v_program_id, true;
    return;
  end if;

  set constraints program_exercises_day_position_uniq deferred;
  update public.program_exercises pe
  set position = case
    when pe.id = p_id then v_neighbor_position
    when pe.id = v_neighbor_id then v_position
  end
  where pe.id in (p_id, v_neighbor_id);

  update public.programs
    set version = p_program_version + 1
    where id = v_program_id and version = p_program_version;

  return query select v_program_id, false;
end;
$$;

create or replace function public.swap_program_day_position(
  p_id uuid,
  p_direction text,
  p_program_version integer
) returns table(program_id uuid, noop boolean)
language plpgsql
security invoker
as $$
declare
  v_program_id uuid;
  v_week_number integer;
  v_day_number integer;
  v_neighbor_id uuid;
  v_neighbor_day_number integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'invalid direction: %', p_direction using errcode = '22023';
  end if;

  select pd.program_id, pd.week_number, pd.day_number
    into v_program_id, v_week_number, v_day_number
    from public.program_days pd
    where pd.id = p_id;

  if v_program_id is null then
    raise exception 'day not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select pd2.id, pd2.day_number
      into v_neighbor_id, v_neighbor_day_number
      from public.program_days pd2
      where pd2.program_id = v_program_id
        and pd2.week_number = v_week_number
        and pd2.day_number < v_day_number
      order by pd2.day_number desc
      limit 1;
  else
    select pd2.id, pd2.day_number
      into v_neighbor_id, v_neighbor_day_number
      from public.program_days pd2
      where pd2.program_id = v_program_id
        and pd2.week_number = v_week_number
        and pd2.day_number > v_day_number
      order by pd2.day_number asc
      limit 1;
  end if;

  if v_neighbor_id is null then
    return query select v_program_id, true;
    return;
  end if;

  set constraints program_days_program_id_week_number_day_number_key deferred;
  update public.program_days pd
  set day_number = case
    when pd.id = p_id then v_neighbor_day_number
    when pd.id = v_neighbor_id then v_day_number
  end
  where pd.id in (p_id, v_neighbor_id);

  update public.programs
    set version = p_program_version + 1
    where id = v_program_id and version = p_program_version;

  return query select v_program_id, false;
end;
$$;
