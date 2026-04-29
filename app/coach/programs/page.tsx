import Link from 'next/link';
import { listPrograms } from '@/lib/programs/actions/list-programs';
import { ProgramsTabs } from './programs-tabs';

type SearchParams = { tab?: string; archived?: string; block?: string };

export const metadata = { title: 'Programs · Steele & Co.' };

export default async function ProgramsPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab: 'programs' | 'templates' = sp.tab === 'templates' ? 'templates' : 'programs';
  const includeArchived = sp.archived === '1';

  const rows = await listPrograms({ tab, includeArchived });
  const filtered = sp.block ? rows.filter((r) => r.blockType === sp.block) : rows;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-gold text-xs tracking-widest uppercase">Library</p>
          <h1 className="text-bone font-serif text-4xl">Programs</h1>
        </div>
        <Link
          href="/coach/programs/new"
          className="border-gold text-gold border px-6 py-3 text-xs tracking-widest uppercase"
        >
          New program
        </Link>
      </header>

      <ProgramsTabs activeTab={tab} includeArchived={includeArchived} blockFilter={sp.block ?? null} />

      {filtered.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: 'programs' | 'templates' }) {
  return (
    <div className="border-hairline-strong flex flex-col items-center gap-4 border p-16 text-center">
      <p className="text-bone-muted">
        {tab === 'templates'
          ? 'No templates yet. Build a program and mark it as a template to reuse later.'
          : 'No programs yet. Build your first one.'}
      </p>
      <Link href="/coach/programs/new" className="text-gold underline-offset-4 hover:underline">
        Create program
      </Link>
    </div>
  );
}

function ProgramCard({ program: p }: { program: Awaited<ReturnType<typeof listPrograms>>[number] }) {
  const blockColor = {
    hypertrophy: 'text-amber-300',
    strength: 'text-gold',
    peak: 'text-rose-300',
    general: 'text-bone-muted',
  }[p.blockType];
  return (
    <li className="border-hairline-strong border bg-[#16140f] p-6">
      <div className="flex items-baseline justify-between">
        <p className={`text-xs tracking-widest uppercase ${blockColor}`}>{p.blockType}</p>
        {!p.isActive && <p className="text-bone-faint text-xs">Archived</p>}
      </div>
      <h3 className="text-bone mt-2 font-serif text-xl">
        <Link href={`/coach/programs/${p.id}/edit`}>{p.name}</Link>
      </h3>
      <p className="text-bone-muted mt-3 text-xs">
        {p.totalWeeks} {p.totalWeeks === 1 ? 'week' : 'weeks'}
        {p.athleteName ? ` · ${p.athleteName}` : ''}
      </p>
      {!p.isActive && (
        <form action={`/coach/programs/${p.id}/restore`} method="post" className="mt-3">
          <button type="submit"
            className="text-gold hover:text-bone text-xs tracking-widest uppercase">
            Restore
          </button>
        </form>
      )}
    </li>
  );
}
