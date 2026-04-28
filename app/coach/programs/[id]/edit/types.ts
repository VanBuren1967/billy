export type ProgramHeader = {
  id: string;
  name: string;
  blockType: 'hypertrophy' | 'strength' | 'peak' | 'general';
  totalWeeks: number;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isTemplate: boolean;
  athleteId: string | null;
  athleteName: string | null;
  version: number;
};

export type ProgramDay = {
  id: string;
  weekNumber: number;
  dayNumber: number;
  name: string;
  notes: string | null;
};

export type ProgramExercise = {
  id: string;
  programDayId: string;
  position: number;
  name: string;
  sets: number;
  reps: string;
  loadPct: number | null;
  loadLbs: number | null;
  rpe: number | null;
  groupLabel: string | null;
  notes: string | null;
};

export type BuilderData = {
  program: ProgramHeader;
  days: ProgramDay[];
  exercises: ProgramExercise[];
};
