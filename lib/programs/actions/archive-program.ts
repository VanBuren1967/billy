'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { archiveProgramSchema } from '../schemas';
import { getCurrentCoach } from '../get-current-coach';
import { programBreadcrumb } from '../breadcrumbs';

const GENERIC_DB_ERROR = 'Failed to archive program. Please try again.';

function maskDbError(operation: string, error: { message: string }) {
  Sentry.captureException(new Error(`archiveProgram.${operation}: ${error.message}`));
  return { ok: false as const, reason: 'db_error' as const, message: GENERIC_DB_ERROR };
}

export async function archiveProgram(input: unknown) {
  const p = archiveProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const { error, data } = await supabase.from('programs')
    .update({ is_active: false }).eq('id', p.data.programId).select('id').maybeSingle();
  if (error) return maskDbError('archive_update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'program not found' };
  programBreadcrumb('program.archived', { program_id: p.data.programId });
  return { ok: true as const };
}

export async function restoreProgram(input: unknown) {
  const p = archiveProgramSchema.safeParse(input);
  if (!p.success) return { ok: false as const, reason: 'invalid' as const, message: p.error.message };
  await getCurrentCoach();
  const supabase = await createClient();
  const { error, data } = await supabase.from('programs')
    .update({ is_active: true }).eq('id', p.data.programId).select('id').maybeSingle();
  if (error) return maskDbError('restore_update', error);
  if (!data) return { ok: false as const, reason: 'not_found' as const, message: 'program not found' };
  programBreadcrumb('program.restored', { program_id: p.data.programId });
  return { ok: true as const };
}
