'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { reorderSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to reorder. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`reorder.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

type SwapResult = { program_id: string; noop: boolean };

export async function reorderProgramExercise(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('swap_program_exercise_position', {
    p_id: p.data.id,
    p_direction: p.data.direction,
    p_program_version: p.data.programVersion,
  });
  if (error) {
    if (error.code === 'P0002') {
      return { ok: false as const, reason: 'not_found' as const, message: 'exercise not found' };
    }
    return maskDbError('exercise_swap_rpc', error);
  }
  const result = (data as SwapResult[] | null)?.[0];
  if (!result) return maskDbError('exercise_swap_rpc', { message: 'no result row' });

  programBreadcrumb('program.edited', {
    program_id: result.program_id, action: 'reorder_exercise', target_id: p.data.id,
  });
  return result.noop
    ? { ok: true as const, noop: true, programId: result.program_id }
    : { ok: true as const, programId: result.program_id };
}

export async function reorderProgramDay(input: unknown) {
  const p = reorderSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('swap_program_day_position', {
    p_id: p.data.id,
    p_direction: p.data.direction,
    p_program_version: p.data.programVersion,
  });
  if (error) {
    if (error.code === 'P0002') {
      return { ok: false as const, reason: 'not_found' as const, message: 'day not found' };
    }
    return maskDbError('day_swap_rpc', error);
  }
  const result = (data as SwapResult[] | null)?.[0];
  if (!result) return maskDbError('day_swap_rpc', { message: 'no result row' });

  programBreadcrumb('program.edited', {
    program_id: result.program_id, action: 'reorder_day', target_id: p.data.id,
  });
  return result.noop
    ? { ok: true as const, noop: true, programId: result.program_id }
    : { ok: true as const, programId: result.program_id };
}
