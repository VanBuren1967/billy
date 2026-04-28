-- Plan 3 Task 8 follow-up: prevent duplicate (program_day_id, position) pairs
-- on program_exercises. Two concurrent addProgramExercise calls reading the
-- same max(position) would otherwise write the same nextPosition silently;
-- the unique constraint forces the second insert to fail, the action returns
-- db_error, and the client retries naturally.

create unique index program_exercises_day_position_uniq
  on public.program_exercises (program_day_id, position);
