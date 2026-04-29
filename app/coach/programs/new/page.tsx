import Link from 'next/link';
import { listPrograms } from '@/lib/programs/actions/list-programs';
import { BlankProgramForm } from './blank-form';

type SP = { mode?: string; source?: string };

export default async function NewProgramPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const mode =
    sp.mode === 'duplicate-template' || sp.mode === 'duplicate-program'
      ? sp.mode
      : sp.mode === 'blank'
        ? 'blank'
        : 'choose';

  if (mode === 'blank') {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <header>
          <p className="text-gold text-xs tracking-widest uppercase">New program</p>
          <h1 className="text-bone font-serif text-3xl">Start blank</h1>
        </header>
        <BlankProgramForm />
      </div>
    );
  }

  if (mode === 'choose') return <Chooser />;
  if (mode === 'duplicate-template') return <SourcePicker tab="templates" mode={mode} />;
  return <SourcePicker tab="programs" mode={mode} />;
}

function Chooser() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">New program</p>
        <h1 className="text-bone font-serif text-4xl">How do you want to start?</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <ChoiceCard href="?mode=blank" title="Start blank" body="Empty program. Add weeks, days, exercises from scratch." />
        <ChoiceCard href="?mode=duplicate-template" title="From a template" body="Duplicate one of your templates as the starting structure." />
        <ChoiceCard href="?mode=duplicate-program" title="From an existing program" body="Duplicate a previously assigned program (e.g., last meet's prep)." />
      </div>
    </div>
  );
}

function ChoiceCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="border-hairline-strong block border bg-[#16140f] p-6 hover:border-gold">
      <h3 className="text-bone font-serif text-xl">{title}</h3>
      <p className="text-bone-muted mt-2 text-sm">{body}</p>
    </Link>
  );
}

async function SourcePicker({ tab, mode }: { tab: 'templates' | 'programs'; mode: string }) {
  const sources = await listPrograms({ tab });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">New program</p>
        <h1 className="text-bone font-serif text-3xl">
          Pick the {tab === 'templates' ? 'template' : 'source program'}
        </h1>
      </header>
      {sources.length === 0 ? (
        <div className="border-hairline-strong border p-12 text-center">
          <p className="text-bone-muted">No {tab === 'templates' ? 'templates' : 'previous programs'} yet.</p>
          <Link href="/coach/programs/new?mode=blank" className="text-gold mt-3 inline-block">
            Start blank instead
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.map((s) => (
            <li key={s.id} className="border-hairline-strong border p-4 hover:border-gold">
              <form action={`/coach/programs/new/duplicate?source=${s.id}&mode=${mode}`} method="post">
                <button type="submit" className="text-bone block w-full text-left">
                  <span className="font-serif text-lg">{s.name}</span>
                  <span className="text-bone-muted ml-3 text-xs">
                    {s.blockType} · {s.totalWeeks} weeks
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
