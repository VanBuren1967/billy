'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveProgramHeader, saveProgramDay, saveProgramExercise,
  addProgramDay, addProgramExercise,
  removeProgramDay, removeProgramExercise,
} from '@/lib/programs/actions/save-program';
import { reorderProgramDay, reorderProgramExercise } from '@/lib/programs/actions/reorder';
import { archiveProgram } from '@/lib/programs/actions/archive-program';
import type { BuilderData, ProgramDay } from './types';

export function ProgramBuilder({ data: initial }: { data: BuilderData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [conflict, setConflict] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set(
    initial.days.length ? [Math.min(...initial.days.map((d) => d.weekNumber))] : [],
  ));
  const [, startTransition] = useTransition();

  // Re-sync local state when the server-loaded snapshot changes (e.g. after router.refresh()).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setData(initial); }, [initial]);

  if (conflict) return <ConflictPrompt onReload={() => router.refresh()} />;

  function handleResult(r: unknown, after?: () => void) {
    const res = r as { ok?: boolean; reason?: string; message?: string; newVersion?: number };
    if (res.ok === false) {
      if (res.reason === 'conflict') { setConflict(true); return; }
      alert(res.message ?? 'Save failed');
      return;
    }
    if (typeof res.newVersion === 'number') {
      setData((d) => ({ ...d, program: { ...d.program, version: res.newVersion as number } }));
    }
    after?.();
    router.refresh();
  }

  const weeks = Array.from(new Set(data.days.map((d) => d.weekNumber))).sort((a, b) => a - b);
  const lastWeek = weeks[weeks.length - 1] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Header data={data} onSave={(p) => startTransition(async () => {
            const r = await saveProgramHeader({ ...p, programId: data.program.id, programVersion: data.program.version });
            handleResult(r);
          })} />
        </div>
        <button
          type="button"
          aria-label="Archive program"
          onClick={() => {
            if (!confirm('Archive this program? You can restore it later from the library.')) return;
            startTransition(async () => {
              const r = await archiveProgram({ programId: data.program.id });
              const res = r as { ok: boolean; message?: string };
              if (!res.ok) {
                alert(res.message ?? 'Archive failed');
                return;
              }
              router.push('/coach/programs');
            });
          }}
          className="text-bone-faint hover:text-rose-400 self-start text-xs tracking-widest uppercase"
        >
          Archive
        </button>
      </div>

      {weeks.length === 0 && (
        <div className="border-hairline-strong border p-8 text-center">
          <p className="text-bone-muted">No weeks yet.</p>
        </div>
      )}

      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const daysInWeek = data.days.filter((d) => d.weekNumber === wk).sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section key={wk} className="border-hairline-strong border">
            <button type="button" className="text-bone flex w-full items-center justify-between px-5 py-3 text-left"
              onClick={() => setOpen((s) => {
                const next = new Set(s); if (next.has(wk)) next.delete(wk); else next.add(wk); return next;
              })}>
              <span className="font-serif text-xl">Week {wk}</span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <EditableDay
                    key={d.id} day={d}
                    exercises={data.exercises.filter((e) => e.programDayId === d.id)}
                    programVersion={data.program.version}
                    onResult={handleResult}
                  />
                ))}
                <button
                  type="button"
                  className="text-gold border-gold mt-2 self-start border px-4 py-2 text-xs tracking-widest uppercase"
                  onClick={() => startTransition(async () => {
                    const r = await addProgramDay({
                      programId: data.program.id, programVersion: data.program.version, weekNumber: wk,
                    });
                    handleResult(r);
                  })}
                >
                  + Add day
                </button>
              </div>
            )}
          </section>
        );
      })}

      <button
        type="button"
        className="text-gold border-gold self-start border px-4 py-2 text-xs tracking-widest uppercase"
        onClick={() => startTransition(async () => {
          const r = await addProgramDay({
            programId: data.program.id, programVersion: data.program.version, weekNumber: lastWeek + 1,
          });
          handleResult(r);
        })}
      >
        + Add week
      </button>
    </div>
  );
}

function Header({
  data, onSave,
}: {
  data: BuilderData;
  onSave: (p: {
    name: string;
    blockType: BuilderData['program']['blockType'];
    totalWeeks: number;
    notes: string | null;
    startDate: string | null;
    endDate: string | null;
  }) => void;
}) {
  const [name, setName] = useState(data.program.name);
  return (
    <header className="flex flex-col gap-1">
      <p className="text-gold text-xs tracking-widest uppercase">
        {data.program.isTemplate ? 'Template' : data.program.athleteName ?? 'Unassigned'}
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name !== data.program.name) {
            onSave({
              name,
              blockType: data.program.blockType,
              totalWeeks: data.program.totalWeeks,
              notes: data.program.notes,
              startDate: data.program.startDate,
              endDate: data.program.endDate,
            });
          }
        }}
        className="text-bone bg-transparent font-serif text-3xl outline-none focus:border-b focus:border-gold/60"
      />
      <p className="text-bone-muted text-xs">
        {data.program.blockType} · {data.program.totalWeeks} weeks · version {data.program.version}
      </p>
    </header>
  );
}

function EditableDay({
  day, exercises, programVersion, onResult,
}: {
  day: ProgramDay;
  exercises: BuilderData['exercises'];
  programVersion: number;
  onResult: (r: unknown) => void;
}) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(day.name);

  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} —
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== day.name) {
                startTransition(async () => {
                  const r = await saveProgramDay({
                    programDayId: day.id, programVersion,
                    weekNumber: day.weekNumber, dayNumber: day.dayNumber,
                    name, notes: day.notes,
                  });
                  onResult(r);
                });
              }
            }}
            className="text-bone ml-2 bg-transparent font-serif outline-none focus:border-b focus:border-gold/60"
          />
        </h3>
        <div className="flex gap-1 text-xs">
          <button type="button" aria-label={`Move Day ${day.dayNumber} up`} onClick={() => startTransition(async () => {
            const r = await reorderProgramDay({ id: day.id, programVersion, direction: 'up' });
            onResult(r);
          })} className="text-bone-faint hover:text-bone">▲</button>
          <button type="button" aria-label={`Move Day ${day.dayNumber} down`} onClick={() => startTransition(async () => {
            const r = await reorderProgramDay({ id: day.id, programVersion, direction: 'down' });
            onResult(r);
          })} className="text-bone-faint hover:text-bone">▼</button>
          <button type="button" aria-label={`Remove Day ${day.dayNumber}`} onClick={() => {
            if (!confirm(`Remove Day ${day.dayNumber}?`)) return;
            startTransition(async () => {
              const r = await removeProgramDay({ programDayId: day.id, programVersion });
              onResult(r);
            });
          }} className="text-rose-400/70 hover:text-rose-400">✕</button>
        </div>
      </header>
      <table className="text-bone mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
            <th className="py-1 text-left font-normal">Block</th>
            <th className="py-1 text-left font-normal">Exercise</th>
            <th className="py-1 text-left font-normal">Sets×Reps</th>
            <th className="py-1 text-left font-normal">Load</th>
            <th className="py-1 text-left font-normal">RPE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {exercises.map((e) => (
            <EditableExerciseRow
              key={e.id} exercise={e} programVersion={programVersion} onResult={onResult}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="text-gold mt-2 text-xs tracking-widest uppercase"
        onClick={() => startTransition(async () => {
          const r = await addProgramExercise({ programDayId: day.id, programVersion });
          onResult(r);
        })}
      >
        + Add exercise
      </button>
    </article>
  );
}

function EditableExerciseRow({
  exercise: e, programVersion, onResult,
}: {
  exercise: BuilderData['exercises'][number];
  programVersion: number;
  onResult: (r: unknown) => void;
}) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState({ ...e });

  // Re-sync local draft when the exercise prop changes (e.g., after router.refresh).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft({ ...e }); }, [e]);

  function save() {
    startTransition(async () => {
      const r = await saveProgramExercise({
        programExerciseId: e.id, programVersion,
        name: draft.name, sets: draft.sets, reps: draft.reps,
        loadPct: draft.loadPct, loadLbs: draft.loadLbs,
        rpe: draft.rpe, groupLabel: draft.groupLabel, notes: draft.notes,
      });
      onResult(r);
    });
  }

  return (
    <tr className="border-b border-[#1a1814]/40">
      <td className="py-1.5">
        <input value={draft.groupLabel ?? ''} maxLength={20}
          onChange={(ev) => setDraft({ ...draft, groupLabel: ev.target.value || null })}
          onBlur={save} className="text-gold w-12 bg-transparent text-center outline-none focus:border-b focus:border-gold/60" />
      </td>
      <td className="py-1.5">
        <input value={draft.name} maxLength={120}
          onChange={(ev) => setDraft({ ...draft, name: ev.target.value })}
          onBlur={save} className="text-bone bg-transparent outline-none focus:border-b focus:border-gold/60" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.sets} min={1} max={50}
          onChange={(ev) => setDraft({ ...draft, sets: Number(ev.target.value) })}
          onBlur={save} className="text-bone w-12 bg-transparent text-right outline-none focus:border-b focus:border-gold/60" />
        <span className="text-bone-faint">×</span>
        <input value={draft.reps} maxLength={40}
          onChange={(ev) => setDraft({ ...draft, reps: ev.target.value })}
          onBlur={save} className="text-bone ml-1 w-20 bg-transparent outline-none focus:border-b focus:border-gold/60" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.loadPct ?? ''} min={0} max={150} step="0.5" placeholder="%"
          onChange={(ev) => setDraft({ ...draft, loadPct: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone w-16 bg-transparent text-right outline-none focus:border-b focus:border-gold/60" />
        <input type="number" value={draft.loadLbs ?? ''} min={0} max={2500} placeholder="lb"
          onChange={(ev) => setDraft({ ...draft, loadLbs: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone ml-1 w-16 bg-transparent text-right outline-none focus:border-b focus:border-gold/60" />
      </td>
      <td className="py-1.5">
        <input type="number" value={draft.rpe ?? ''} min={0} max={10} step="0.5"
          onChange={(ev) => setDraft({ ...draft, rpe: ev.target.value === '' ? null : Number(ev.target.value) })}
          onBlur={save} className="text-bone w-12 bg-transparent text-right outline-none focus:border-b focus:border-gold/60" />
      </td>
      <td className="py-1.5 text-xs whitespace-nowrap">
        <button type="button" aria-label={`Move ${e.name} up`} onClick={() => startTransition(async () => {
          const r = await reorderProgramExercise({ id: e.id, programVersion, direction: 'up' });
          onResult(r);
        })} className="text-bone-faint hover:text-bone">▲</button>
        <button type="button" aria-label={`Move ${e.name} down`} onClick={() => startTransition(async () => {
          const r = await reorderProgramExercise({ id: e.id, programVersion, direction: 'down' });
          onResult(r);
        })} className="text-bone-faint hover:text-bone ml-1">▼</button>
        <button type="button" aria-label={`Remove ${e.name}`} onClick={() => {
          if (!confirm(`Remove ${e.name}?`)) return;
          startTransition(async () => {
            const r = await removeProgramExercise({ programExerciseId: e.id, programVersion });
            onResult(r);
          });
        }} className="text-rose-400/70 hover:text-rose-400 ml-2">✕</button>
      </td>
    </tr>
  );
}

function ConflictPrompt({ onReload }: { onReload: () => void }) {
  return (
    <div className="border-hairline-strong mx-auto mt-20 max-w-md border p-8 text-center">
      <p className="text-gold text-xs tracking-widest uppercase">Edit conflict</p>
      <h2 className="text-bone mt-3 font-serif text-2xl">This program was edited elsewhere.</h2>
      <p className="text-bone-muted mt-3 text-sm">
        Reload to see the latest version. Your unsaved field will be lost; your prior saved changes are preserved.
      </p>
      <button onClick={onReload} className="border-gold text-gold mt-6 border px-6 py-3 text-xs tracking-widest uppercase">
        Reload
      </button>
    </div>
  );
}
