'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assignProgramToAthlete } from '@/lib/programs/actions/assign-program';

export function AssignForm({
  templateProgramId, athletes,
}: {
  templateProgramId: string;
  athletes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nextMonday = (() => {
    const d = new Date();
    const day = d.getDay();
    const offset = (1 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const fd = new FormData(e.currentTarget);
        const r = await assignProgramToAthlete({
          templateProgramId,
          athleteId: String(fd.get('athleteId')),
          startDate: String(fd.get('startDate')),
        });
        setBusy(false);
        if (!('ok' in r) || !r.ok) {
          setErr(('message' in r && r.message) ? r.message : 'Assign failed');
          return;
        }
        router.push(`/coach/programs/${r.newProgramId}/edit`);
      }}
      className="flex flex-col gap-5"
    >
      <label className="flex flex-col gap-1">
        <span className="text-bone-muted text-xs tracking-widest uppercase">Athlete</span>
        <select name="athleteId" required defaultValue=""
          className="border-hairline-strong w-full border bg-[#0c0c0c] px-3 py-2 text-bone">
          <option value="" disabled>Pick an athlete…</option>
          {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-bone-muted text-xs tracking-widest uppercase">Start date</span>
        <input type="date" name="startDate" required defaultValue={nextMonday}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </label>
      {athletes.length === 0 && (
        <p className="text-bone-muted text-sm">
          No athletes on your roster yet. Invite an athlete first, then assign this template.
        </p>
      )}
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button type="submit" disabled={busy || athletes.length === 0}
        className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
        {busy ? 'Assigning…' : 'Assign program'}
      </button>
    </form>
  );
}
