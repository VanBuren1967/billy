'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createProgram } from '@/lib/programs/actions/create-program';

export function BlankProgramForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const f = e.currentTarget;
        const fd = new FormData(f);
        const r = await createProgram({
          mode: 'blank',
          name: String(fd.get('name')),
          blockType: String(fd.get('blockType')),
          totalWeeks: Number(fd.get('totalWeeks')),
          notes: String(fd.get('notes') ?? '') || null,
          isTemplate: fd.get('isTemplate') === 'on',
        });
        setBusy(false);
        if (!r.ok) { setErr(r.message); return; }
        router.push(`/coach/programs/${r.programId}/edit`);
      }}
      className="flex flex-col gap-5"
    >
      <Field label="Name">
        <input name="name" required maxLength={120}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <Field label="Block type">
        <select name="blockType" required defaultValue="strength"
          className="border-hairline-strong w-full border bg-[#0c0c0c] px-3 py-2 text-bone">
          <option value="hypertrophy">Hypertrophy</option>
          <option value="strength">Strength</option>
          <option value="peak">Peak</option>
          <option value="general">General</option>
        </select>
      </Field>
      <Field label="Total weeks">
        <input name="totalWeeks" type="number" required min={1} max={52} defaultValue={8}
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <Field label="Notes (optional)">
        <textarea name="notes" maxLength={2000}
          className="border-hairline-strong h-24 w-full border bg-transparent px-3 py-2 text-bone" />
      </Field>
      <label className="text-bone-muted flex items-center gap-2 text-sm">
        <input type="checkbox" name="isTemplate" /> Save as template
      </label>
      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <button
        type="submit" disabled={busy}
        className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create program'}
      </button>
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
