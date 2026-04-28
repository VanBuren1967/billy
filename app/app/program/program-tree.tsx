'use client';

import { useState } from 'react';
import type { ActiveProgramTree } from '@/lib/athletes/get-active-program';

export function ProgramTree({
  tree, currentWeek,
}: { tree: ActiveProgramTree; currentWeek: number }) {
  const weeks = Array.from(new Set(tree.days.map((d) => d.weekNumber))).sort((a, b) => a - b);
  const [open, setOpen] = useState<Set<number>>(new Set([currentWeek]));

  if (weeks.length === 0) {
    return <p className="text-bone-muted">No weeks yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {weeks.map((wk) => {
        const isOpen = open.has(wk);
        const isCurrent = wk === currentWeek;
        const isPast = wk < currentWeek;
        const daysInWeek = tree.days
          .filter((d) => d.weekNumber === wk)
          .sort((a, b) => a.dayNumber - b.dayNumber);
        return (
          <section
            key={wk}
            className={`border ${isCurrent ? 'border-gold' : 'border-hairline-strong'} ${isPast ? 'opacity-60' : ''}`}
          >
            <button
              type="button"
              className="flex w-full items-baseline justify-between px-5 py-3 text-left"
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(wk)) next.delete(wk);
                  else next.add(wk);
                  return next;
                })
              }
            >
              <span className={`font-serif text-xl ${isCurrent ? 'text-gold' : 'text-bone'}`}>
                Week {wk}
                {isCurrent && <span className="ml-2 text-xs tracking-widest uppercase">Current</span>}
              </span>
              <span className="text-bone-faint text-xs">
                {daysInWeek.length} {daysInWeek.length === 1 ? 'day' : 'days'} {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-[#1f1d18] px-5 py-4">
                {daysInWeek.map((d) => (
                  <DayCard
                    key={d.id}
                    day={d}
                    exercises={tree.exercises.filter((e) => e.programDayId === d.id)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayCard({
  day, exercises,
}: {
  day: ActiveProgramTree['days'][number];
  exercises: ActiveProgramTree['exercises'];
}) {
  return (
    <article className="border-l-2 border-[#1f1d18] pl-4">
      <header>
        <h3 className="text-bone font-serif text-lg">
          Day {day.dayNumber} — {day.name}
        </h3>
      </header>
      {exercises.length === 0 ? (
        <p className="text-bone-faint mt-2 text-xs">No exercises programmed for this day.</p>
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
