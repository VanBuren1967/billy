import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentCoach } from '../get-current-coach';

export type ProgramSummary = {
  id: string;
  name: string;
  blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
  totalWeeks: number;
  startDate: string | null;
  athleteId: string | null;
  athleteName: string | null;
  isTemplate: boolean;
  isActive: boolean;
  updatedAt: string;
};

export type ListProgramsArgs = {
  tab: 'programs' | 'templates';
  athleteId?: string;
  includeArchived?: boolean;
};

export async function listPrograms(args: ListProgramsArgs): Promise<ProgramSummary[]> {
  await getCurrentCoach(); // guards: throws if not a coach
  const supabase = await createClient();

  let q = supabase
    .from('programs')
    .select(`
      id, name, block_type, total_weeks, start_date, athlete_id, is_template,
      is_active, created_at,
      athlete:athletes(id, name)
    `)
    .order('created_at', { ascending: false });

  if (args.tab === 'templates') {
    q = q.eq('is_template', true);
  } else {
    q = q.eq('is_template', false);
  }
  if (!args.includeArchived) {
    q = q.eq('is_active', true);
  }
  if (args.athleteId) {
    q = q.eq('athlete_id', args.athleteId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`list_programs_failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    blockType: row.block_type as ProgramSummary['blockType'],
    totalWeeks: row.total_weeks,
    startDate: row.start_date,
    athleteId: row.athlete_id,
    athleteName: (row.athlete as unknown as { name: string } | null)?.name ?? null,
    isTemplate: row.is_template,
    isActive: row.is_active,
    updatedAt: row.created_at,
  }));
}
