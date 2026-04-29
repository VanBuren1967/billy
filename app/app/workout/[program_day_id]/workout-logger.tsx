'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSetLog } from '@/lib/workouts/actions/save-set-log';
import { saveWorkoutNotes } from '@/lib/workouts/actions/save-workout-notes';
import { markWorkoutComplete, reopenWorkout } from '@/lib/workouts/actions/mark-complete';

type Exercise = {
  id: string; position: number; name: string; sets: number; reps: string;
  loadPct: number | null; loadLbs: number | null; rpe: number | null;
  groupLabel: string | null;
};
type SetRow = {
  id: string; programExerciseId: string; setNumber: number;
  weightLbs: number | null; repsDone: number | null; rpe: number | null; completed: boolean;
};
type WorkoutLog = {
  id: string; status: 'in_progress' | 'completed' | 'skipped';
  completedAt: string | null; painNotes: string | null; generalNotes: string | null;
};

export function WorkoutLogger({
  workoutLog: initialLog, sets: initialSets, exercises,
}: {
  workoutLog: WorkoutLog;
  sets: SetRow[];
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [log, setLog] = useState(initialLog);
  const [sets, setSets] = useState(initialSets);
  const [, startTransition] = useTransition();
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isCompleted = log.status === 'completed';

  function announceSave(p: Promise<{ ok?: boolean; message?: string }>) {
    setSavingState('saving');
    p.then((r) => {
      if (r.ok === false) {
        setSavingState('error');
        return;
      }
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1200);
    });
  }

  function updateSetLocal(id: string, patch: Partial<SetRow>) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function saveSet(id: string, patch: Partial<SetRow>) {
    if (isCompleted) return;
    updateSetLocal(id, patch);
    const payload: Record<string, unknown> = { setLogId: id };
    if (patch.weightLbs !== undefined) payload.weightLbs = patch.weightLbs;
    if (patch.repsDone !== undefined) payload.repsDone = patch.repsDone;
    if (patch.rpe !== undefined) payload.rpe = patch.rpe;
    if (patch.completed !== undefined) payload.completed = patch.completed;
    startTransition(() => announceSave(saveSetLog(payload) as Promise<{ ok?: boolean }>));
  }

  function saveNotes(patch: Partial<{ painNotes: string | null; generalNotes: string | null }>) {
    if (isCompleted) return;
    setLog((l) => ({ ...l, ...patch }));
    startTransition(() => announceSave(
      saveWorkoutNotes({ workoutLogId: log.id, ...patch }) as Promise<{ ok?: boolean }>,
    ));
  }

  return (
    <div className="flex flex-col gap-8">
      <SaveIndicator state={savingState} completed={isCompleted} />

      {exercises.map((ex) => {
        const setsForEx = sets
          .filter((s) => s.programExerciseId === ex.id)
          .sort((a, b) => a.setNumber - b.setNumber);
        return (
          <ExerciseBlock key={ex.id} ex={ex} sets={setsForEx} disabled={isCompleted} onSave={saveSet} />
        );
      })}

      <NotesBlock log={log} disabled={isCompleted} onSave={saveNotes} />

      <CompletionBar log={log} onComplete={() => {
        startTransition(async () => {
          const r = await markWorkoutComplete({ workoutLogId: log.id });
          if ((r as { ok?: boolean }).ok !== false) {
            setLog((l) => ({ ...l, status: 'completed', completedAt: new Date().toISOString() }));
            router.refresh();
          }
        });
      }} onReopen={() => {
        startTransition(async () => {
          const r = await reopenWorkout({ workoutLogId: log.id });
          if ((r as { ok?: boolean }).ok !== false) {
            setLog((l) => ({ ...l, status: 'in_progress', completedAt: null }));
            router.refresh();
          }
        });
      }} />
    </div>
  );
}

function SaveIndicator({ state, completed }: { state: 'idle' | 'saving' | 'saved' | 'error'; completed: boolean }) {
  if (completed) {
    return <p className="text-gold text-xs tracking-widest uppercase">✓ Workout complete</p>;
  }
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Save failed' : '';
  const color = state === 'error' ? 'text-rose-400' : 'text-bone-faint';
  return <p className={`${color} h-4 text-xs tracking-widest uppercase`}>{text}</p>;
}

function ExerciseBlock({
  ex, sets, disabled, onSave,
}: {
  ex: Exercise; sets: SetRow[]; disabled: boolean;
  onSave: (id: string, patch: Partial<SetRow>) => void;
}) {
  const prescription = ex.loadPct != null ? `${ex.loadPct}%` : ex.loadLbs != null ? `${ex.loadLbs} lb` : '—';
  return (
    <section className="border-hairline-strong border bg-[#16140f] p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          {ex.groupLabel && <p className="text-gold text-xs tracking-widest uppercase">{ex.groupLabel}</p>}
          <h3 className="text-bone font-serif text-xl">{ex.name}</h3>
        </div>
        <p className="text-bone-muted text-xs">
          {ex.sets}×{ex.reps} · {prescription}{ex.rpe != null ? ` · RPE ${ex.rpe}` : ''}
        </p>
      </header>
      <table className="text-bone w-full text-sm tabular-nums">
        <thead>
          <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
            <th className="py-1 text-left font-normal">Set</th>
            <th className="py-1 text-left font-normal">Weight</th>
            <th className="py-1 text-left font-normal">Reps</th>
            <th className="py-1 text-left font-normal">RPE</th>
            <th className="py-1 text-center font-normal">Done</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id} className="border-b border-[#1a1814]/40">
              <td className="py-2 text-bone-faint">{s.setNumber}</td>
              <td className="py-2">
                <input type="number" inputMode="numeric" disabled={disabled}
                  defaultValue={s.weightLbs ?? ''} placeholder="lb" min={0} max={2500} step="2.5"
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.weightLbs) onSave(s.id, { weightLbs: v });
                  }}
                  className="text-bone w-20 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2">
                <input type="number" inputMode="numeric" disabled={disabled}
                  defaultValue={s.repsDone ?? ''} min={0} max={200}
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.repsDone) onSave(s.id, { repsDone: v });
                  }}
                  className="text-bone w-16 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2">
                <input type="number" inputMode="decimal" disabled={disabled}
                  defaultValue={s.rpe ?? ''} min={0} max={10} step="0.5"
                  onBlur={(ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    if (v !== s.rpe) onSave(s.id, { rpe: v });
                  }}
                  className="text-bone w-12 bg-transparent outline-none focus:border-b focus:border-gold/60 disabled:opacity-50" />
              </td>
              <td className="py-2 text-center">
                <button
                  type="button" disabled={disabled} aria-label={`Mark set ${s.setNumber} done`}
                  onClick={() => onSave(s.id, { completed: !s.completed })}
                  className={`h-8 w-8 rounded-full border ${s.completed ? 'border-gold bg-gold/10 text-gold' : 'border-hairline-strong text-bone-faint'} disabled:opacity-50`}
                >
                  {s.completed ? '✓' : ''}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NotesBlock({
  log, disabled, onSave,
}: {
  log: WorkoutLog; disabled: boolean;
  onSave: (patch: Partial<{ painNotes: string | null; generalNotes: string | null }>) => void;
}) {
  return (
    <section className="border-hairline-strong border bg-[#16140f] p-4">
      <h3 className="text-bone-muted mb-3 text-xs tracking-widest uppercase">Notes</h3>
      <label className="mb-3 flex flex-col gap-1">
        <span className="text-bone-faint text-xs">Pain (optional)</span>
        <textarea defaultValue={log.painNotes ?? ''} disabled={disabled} maxLength={2000}
          onBlur={(ev) => {
            const v = ev.target.value || null;
            if (v !== log.painNotes) onSave({ painNotes: v });
          }}
          className="border-hairline-strong h-16 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60 disabled:opacity-50" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-bone-faint text-xs">General notes (optional)</span>
        <textarea defaultValue={log.generalNotes ?? ''} disabled={disabled} maxLength={2000}
          onBlur={(ev) => {
            const v = ev.target.value || null;
            if (v !== log.generalNotes) onSave({ generalNotes: v });
          }}
          className="border-hairline-strong h-16 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60 disabled:opacity-50" />
      </label>
    </section>
  );
}

function CompletionBar({
  log, onComplete, onReopen,
}: { log: WorkoutLog; onComplete: () => void; onReopen: () => void }) {
  if (log.status === 'completed') {
    return (
      <div className="flex items-baseline justify-between border-hairline-strong border bg-[#16140f] p-4">
        <div>
          <p className="text-gold text-xs tracking-widest uppercase">Completed</p>
          <p className="text-bone-muted text-xs">
            {log.completedAt ? new Date(log.completedAt).toLocaleString() : ''}
          </p>
        </div>
        <button type="button" onClick={onReopen}
          className="text-bone-faint hover:text-bone text-xs tracking-widest uppercase">
          Reopen
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={onComplete}
      className="border-gold text-gold border self-start px-8 py-3 text-xs tracking-widest uppercase">
      Mark complete
    </button>
  );
}
