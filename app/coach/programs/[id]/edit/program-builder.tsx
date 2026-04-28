'use client';

import { useState } from 'react';
import type { BuilderData, ProgramDay } from './types';

export function ProgramBuilder({ data }: { data: BuilderData }) {
  const [open, setOpen] = useState<Set<number>>(new Set([1]));
  const weeks = Array.from(
    new Set(data.days.map((d) => d.weekNumber)),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-gold text-xs tracking-widest uppercase">
          {data.program.isTemplate ? 'Template' : data.program.athleteName ?? 'Unassigned'}
        </p>
        <h1 className="text-bone font-serif text-3xl">{data.program.name}</h1>
        <p className="text-bone-muted text-xs">
          {data.program.blockType} · {data.program.totalWeeks} weeks ·
          version {data.program.version}
        </p>
      </header>

      {weeks.length === 0 && (
        <div className="border-hairline-strong border p-8 text-center">
          <p className="text-bone-muted">No weeks yet.</p>
        </div>
      )}

      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const daysInWeek = data.days
          .filter((d) => d.weekNumber === wk)
          .sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section key={wk} className="border-hairline-strong border">
            <button
              type="button"
              className="text-bone flex w-full items-center justify-between px-5 py-3 text-left"
              onClick={() => {
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(wk)) next.delete(wk); else next.add(wk);
                  return next;
                });
              }}
            >
              <span className="font-serif text-xl">Week {wk}</span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <DayBlock key={d.id} day={d} exercises={data.exercises.filter((e) => e.programDayId === d.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayBlock({
  day,
  exercises,
}: {
  day: ProgramDay;
  exercises: BuilderData['exercises'];
}) {
  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} — {day.name}
        </h3>
      </header>
      {exercises.length === 0 ? (
        <p className="text-bone-faint mt-2 text-xs">No exercises yet.</p>
      ) : (
        <table className="text-bone mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-bone-faint border-b border-[#1f1d18] text-xs uppercase">
              <th className="py-1 text-left font-normal">Block</th>
              <th className="py-1 text-left font-normal">Exercise</th>
              <th className="py-1 text-left font-normal">Sets×Reps</th>
              <th className="py-1 text-left font-normal">Load</th>
              <th className="py-1 text-left font-normal">RPE</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((e) => (
              <tr key={e.id} className="border-b border-[#1a1814]/40">
                <td className="py-1.5 text-gold">
                  {e.groupLabel ?? <span className="text-bone-faint">—</span>}
                </td>
                <td className="py-1.5">{e.name}</td>
                <td className="py-1.5">{e.sets}×{e.reps}</td>
                <td className="py-1.5">
                  {e.loadPct != null ? `${e.loadPct}%` : e.loadLbs != null ? `${e.loadLbs} lb` : '—'}
                </td>
                <td className="py-1.5">{e.rpe ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
