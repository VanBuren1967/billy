'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveCheckIn } from '@/lib/check-ins/actions/save-check-in';
import type { CheckInRow } from '@/lib/check-ins/get-current-week';

const METRICS = [
  { key: 'fatigue', label: 'Fatigue', sub: '1 = fresh · 10 = wrecked' },
  { key: 'soreness', label: 'Soreness', sub: '1 = none · 10 = severe' },
  { key: 'confidence', label: 'Confidence', sub: '1 = shaken · 10 = locked in' },
  { key: 'motivation', label: 'Motivation', sub: '1 = flat · 10 = ready to go' },
] as const;

export function CheckInForm({ initial }: { initial: CheckInRow | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [bodyweight, setBodyweight] = useState(initial?.bodyweightLbs.toString() ?? '');
  const [fatigue, setFatigue] = useState(initial?.fatigue ?? 5);
  const [soreness, setSoreness] = useState(initial?.soreness ?? 5);
  const [confidence, setConfidence] = useState(initial?.confidence ?? 5);
  const [motivation, setMotivation] = useState(initial?.motivation ?? 5);
  const [meetReadiness, setMeetReadiness] = useState<number | null>(initial?.meetReadiness ?? null);
  const [painNotes, setPainNotes] = useState(initial?.painNotes ?? '');
  const [comments, setComments] = useState(initial?.comments ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        setSavingState('saving');
        startTransition(async () => {
          const r = await saveCheckIn({
            bodyweightLbs: Number(bodyweight),
            fatigue, soreness, confidence, motivation,
            meetReadiness,
            painNotes: painNotes || null,
            comments: comments || null,
          });
          if ((r as { ok: boolean }).ok === false) {
            setSavingState('error');
            setErr((r as { message?: string }).message ?? 'Save failed');
            return;
          }
          setSavingState('saved');
          setTimeout(() => setSavingState('idle'), 1500);
          router.refresh();
        });
      }}
      className="flex flex-col gap-6"
    >
      <Field label="Bodyweight (lb)">
        <input type="number" inputMode="decimal" required min={50} max={700} step="0.1"
          value={bodyweight} onChange={(e) => setBodyweight(e.target.value)}
          className="border-hairline-strong w-32 border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      {METRICS.map(({ key, label, sub }) => {
        const value =
          key === 'fatigue' ? fatigue :
          key === 'soreness' ? soreness :
          key === 'confidence' ? confidence :
          motivation;
        const setter =
          key === 'fatigue' ? setFatigue :
          key === 'soreness' ? setSoreness :
          key === 'confidence' ? setConfidence :
          setMotivation;
        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-bone-muted text-xs tracking-widest uppercase">{label}</span>
              <span className="text-gold font-serif text-2xl tabular-nums">{value}</span>
            </div>
            <input type="range" min={1} max={10} step={1} value={value}
              onChange={(e) => setter(Number(e.target.value))}
              className="accent-gold w-full" aria-label={label} />
            <p className="text-bone-faint text-xs">{sub}</p>
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-bone-muted text-xs tracking-widest uppercase">Meet readiness <span className="text-bone-faint normal-case">(optional)</span></span>
          <span className="text-gold font-serif text-2xl tabular-nums">{meetReadiness ?? '—'}</span>
        </div>
        <input type="range" min={0} max={10} step={1} value={meetReadiness ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMeetReadiness(v === 0 ? null : v);
          }}
          className="accent-gold w-full" aria-label="Meet readiness" />
        <p className="text-bone-faint text-xs">Slide to 0 to leave blank if not in meet prep.</p>
      </div>

      <Field label="Pain notes (optional)">
        <textarea maxLength={2000} value={painNotes} onChange={(e) => setPainNotes(e.target.value)}
          className="border-hairline-strong h-20 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      <Field label="General comments (optional)">
        <textarea maxLength={2000} value={comments} onChange={(e) => setComments(e.target.value)}
          className="border-hairline-strong h-24 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      {err && <p className="text-rose-400 text-sm">{err}</p>}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={savingState === 'saving'}
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
          {savingState === 'saving' ? 'Saving…' : initial ? 'Update check-in' : 'Submit check-in'}
        </button>
        {savingState === 'saved' && <p className="text-gold text-xs tracking-widest uppercase">✓ Saved</p>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-bone-muted text-xs tracking-widest uppercase">{label}</span>
      {children}
    </label>
  );
}
