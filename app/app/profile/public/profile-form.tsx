'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOwnPublicProfile } from '@/lib/public-profiles/actions/save-own';
import type { OwnPublicProfile } from '@/lib/public-profiles/get-own';

type MeetResult = { meet: string; date: string; total_lbs: number; placement?: string | null };

export function ProfileForm({ initial }: { initial: OwnPublicProfile | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [headline, setHeadline] = useState(initial?.headline ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? '');
  const [meets, setMeets] = useState<MeetResult[]>(initial?.recentMeetResults ?? []);

  function addMeet() {
    setMeets([...meets, { meet: '', date: '', total_lbs: 0, placement: '' }]);
  }
  function removeMeet(i: number) {
    setMeets(meets.filter((_, idx) => idx !== i));
  }
  function updateMeet(i: number, patch: Partial<MeetResult>) {
    setMeets(meets.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true); setErr(null); setSaved(false);
        startTransition(async () => {
          const r = await saveOwnPublicProfile({
            headline, bio,
            photoUrl: photoUrl || null,
            recentMeetResults: meets
              .filter((m) => m.meet.trim() !== '' && m.date.trim() !== '')
              .map((m) => ({
                meet: m.meet.trim(),
                date: m.date,
                total_lbs: Number(m.total_lbs),
                placement: m.placement?.trim() || null,
              })),
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
      <Field label="Headline">
        <input value={headline} onChange={(e) => setHeadline(e.target.value)} required maxLength={120}
          placeholder="e.g. Junior 198 — USAPL"
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>
      <Field label="Bio">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} required maxLength={4000}
          className="border-hairline-strong h-40 w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>
      <Field label="Photo URL (optional)">
        <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} maxLength={500} placeholder="https://..."
          className="border-hairline-strong w-full border bg-transparent px-3 py-2 text-bone outline-none focus:border-gold/60" />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-bone-muted text-xs tracking-widest uppercase">Recent meets (optional)</legend>
        {meets.map((m, i) => (
          <div key={i} className="border-hairline-strong border bg-[#16140f] p-3 grid grid-cols-1 gap-2 md:grid-cols-5">
            <input value={m.meet} onChange={(e) => updateMeet(i, { meet: e.target.value })}
              placeholder="Meet name" className="border-hairline-strong border bg-transparent px-2 py-1 text-bone text-sm outline-none focus:border-gold/60 md:col-span-2" />
            <input type="date" value={m.date} onChange={(e) => updateMeet(i, { date: e.target.value })}
              className="border-hairline-strong border bg-transparent px-2 py-1 text-bone text-sm outline-none focus:border-gold/60" />
            <input type="number" inputMode="decimal" value={m.total_lbs} onChange={(e) => updateMeet(i, { total_lbs: Number(e.target.value) })}
              placeholder="Total lb" min={0} max={2500} step="2.5"
              className="border-hairline-strong border bg-transparent px-2 py-1 text-bone text-sm outline-none focus:border-gold/60" />
            <div className="flex gap-2">
              <input value={m.placement ?? ''} onChange={(e) => updateMeet(i, { placement: e.target.value })}
                placeholder="Place" maxLength={20}
                className="border-hairline-strong w-full border bg-transparent px-2 py-1 text-bone text-sm outline-none focus:border-gold/60" />
              <button type="button" onClick={() => removeMeet(i)} aria-label="Remove meet"
                className="text-rose-400/70 hover:text-rose-400 px-2">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addMeet}
          className="text-gold border-gold border self-start px-4 py-2 text-xs tracking-widest uppercase">
          + Add meet
        </button>
      </fieldset>

      {err && <p className="text-rose-400 text-sm">{err}</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy}
          className="border-gold text-gold border px-8 py-3 text-xs tracking-widest uppercase disabled:opacity-50">
          {busy ? 'Saving…' : initial ? 'Update profile' : 'Save profile'}
        </button>
        {saved && <p className="text-gold text-xs tracking-widest uppercase">✓ Saved</p>}
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
