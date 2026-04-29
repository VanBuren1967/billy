-- Plan 3.5: athlete metadata fields per V1 design spec §6.1.
-- All columns nullable for backward compatibility with existing rows.

alter table public.athletes
  add column weight_class text,
  add column raw_or_equipped text check (raw_or_equipped is null or raw_or_equipped in ('raw','equipped')),
  add column current_squat_max numeric check (current_squat_max is null or current_squat_max >= 0),
  add column current_bench_max numeric check (current_bench_max is null or current_bench_max >= 0),
  add column current_deadlift_max numeric check (current_deadlift_max is null or current_deadlift_max >= 0),
  add column weak_points text,
  add column injury_history text,
  add column experience_level text,
  add column goal text check (goal is null or goal in ('hypertrophy','strength','meet_prep','general')),
  add column meet_date date,
  add column meet_name text,
  add column coaching_type text check (coaching_type is null or coaching_type in ('hybrid','online'));
