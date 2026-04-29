'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveAthleteProfile } from '@/lib/coach/athlete-profile/save';

type Initial = Record<string, string | number>;

export function ProfileForm({ athleteId, initial }: { athleteId: string; initial: Initial }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [s, setS] = useState({
    weightClass: String(initial.weightClass),
    rawOrEquipped: String(initial.rawOrEquipped),
    currentSquatMax: String(initial.currentSquatMax),
    currentBenchMax: String(initial.currentBenchMax),
    currentDeadliftMax: String(initial.currentDeadliftMax),
    weakPoints: String(initial.weakPoints),
    injuryHistory: String(initial.injuryHistory),
    experienceLevel: String(initial.experienceLevel),
    goal: String(initial.goal),
    meetDate: String(initial.meetDate),
    meetName: String(initial.meetName),
    coachingType: String(initial.coachingType),
  });

  function num(v: string) { return v === '' ? null : Number(v); }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true); setErr(null); setSaved(false);
        startTransition(async () => {
          const r = await saveAthleteProfile({
            athleteId,
            weightClass: s.weightClass || null,
            rawOrEquipped: (s.rawOrEquipped || null) as 'raw' | 'equipped' | null,
            currentSquatMax: num(s.currentSquatMax),
            currentBenchMax: num(s.currentBenchMax),
            currentDeadliftMax: num(s.currentDeadliftMax),
            weakPoints: s.weakPoints || null,
            injuryHistory: s.injuryHistory || null,
            experienceLevel: s.experienceLevel || null,
            goal: (s.goal || null) as 'hypertrophy' | 'strength' | 'meet_prep' | 'general' | null,
            meetDate: s.meetDate || null,
            meetName: s.meetName || null,
            coachingType: (s.coachingType || null) as 'hybrid' | 'online' | null,
          });
          setBusy(false);
          if ((r as { ok: boolean }).ok === false) {
            setErr((r as { message?: string }).message ?? 'Save failed');
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Weight class">
        <input value={s.weightClass} onChange={(e) => setS({ ...s, weightClass: e.target.value })}
          placeholder="e.g. 198, SHW" maxLength={20} className={inputCls} />
      </Field>
      <Field label="Raw or equipped">
        <select value={s.rawOrEquipped} onChange={(e) => setS({ ...s, rawOrEquipped: e.target.value })}
          className={selectCls}>
          <option value="">—</option><option value="raw">Raw</option><option value="equipped">Equipped</option>
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Squat max (lb)">
          <input type="number" inputMode="decimal" min={0} max={2500} step="2.5"
            value={s.currentSquatMax} onChange={(e) => setS({ ...s, currentSquatMax: e.target.value })}
            className={inputCls} />
        </Field>
        <Field label="Bench max (lb)">
          <input type="number" inputMode="decimal" min={0} max={2500} step="2.5"
            value={s.currentBenchMax} onChange={(e) => setS({ ...s, currentBenchMax: e.target.value })}
            className={inputCls} />
        </Field>
        <Field label="Deadlift max (lb)">
          <input type="number" inputMode="decimal" min={0} max={2500} step="2.5"
            value={s.currentDeadliftMax} onChange={(e) => setS({ ...s, currentDeadliftMax: e.target.value })}
            className={inputCls} />
        </Field>
      </div>
      <Field label="Goal">
        <select value={s.goal} onChange={(e) => setS({ ...s, goal: e.target.value })} className={selectCls}>
          <option value="">—</option>
          <option value="hypertrophy">Hypertrophy</option>
          <option value="strength">Strength</option>
          <option value="meet_prep">Meet prep</option>
          <option value="general">General</option>
        </select>
      </Field>
      <Field label="Coaching type">
        <select value={s.coachingType} onChange={(e) => setS({ ...s, coachingType: e.target.value })} className={selectCls}>
          <option value="">—</option><option value="hybrid">Hybrid</option><option value="online">Online</option>
        </select>
      </Field>
      <Field label="Experience level">
        <input value={s.experienceLevel} onChange={(e) => setS({ ...s, experienceLevel: e.target.value })}
          placeholder="e.g. 5 years competing" maxLength={60} className={inputCls} />
      </Field>
      <Field label="Weak points">
        <textarea value={s.weakPoints} onChange={(e) => setS({ ...s, weakPoints: e.target.value })}
          maxLength={2000} className={textareaCls + ' h-20'} />
      </Field>
      <Field label="Injury history">
        <textarea value={s.injuryHistory} onChange={(e) => setS({ ...s, injuryHistory: e.target.value })}
          maxLength={4000} className={textareaCls + ' h-24'} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next meet date">
          <input type="date" value={s.meetDate} onChange={(e) => setS({ ...s, meetDate: e.target.value })}
            className={inputCls} />
        </Field>
        <Field label="Meet name">
          <input value={s.meetName} onChange={(e) => setS({ ...s, meetName: e.target.value })}
            maxLength={120} className={inputCls} />
        </Field>
      </div>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy}
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <p className="text-gold text-xs tracking-widest uppercase">✓ Saved</p>}
      </div>
    </form>
  );
}

const inputCls = 'border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60';
const selectCls = 'border-hairline-strong w-full border bg-[#16140f] px-3 py-2 text-bone outline-none focus:border-gold/60';
const textareaCls = 'border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-bone-muted text-xs tracking-widest uppercase">{label}</span>
      {children}
    </label>
  );
}
