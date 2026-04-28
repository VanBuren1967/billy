import Link from 'next/link';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getActiveProgram } from '@/lib/athletes/get-active-program';
import { computeCurrentWeek } from '@/lib/athletes/program-time';
import { ProgramTree } from './program-tree';

export const metadata = { title: 'Program · Steele & Co.' };

export default async function ProgramPage() {
  await getCurrentAthlete();
  const tree = await getActiveProgram();

  if (!tree) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16 text-center">
        <h1 className="text-bone font-serif text-3xl">No program assigned yet</h1>
        <p className="text-bone-muted">Your coach hasn&rsquo;t assigned you a program yet.</p>
        <Link href="/app" className="text-gold mt-2 text-xs tracking-widest uppercase">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = computeCurrentWeek(tree.program.startDate, today, tree.program.totalWeeks);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-gold text-xs tracking-widest uppercase">{tree.program.blockType}</p>
        <h1 className="text-bone font-serif text-3xl">{tree.program.name}</h1>
        <p className="text-bone-muted text-xs">
          {tree.program.totalWeeks} weeks
          {tree.program.startDate && ` · starts ${tree.program.startDate}`}
        </p>
      </header>
      <ProgramTree tree={tree} currentWeek={currentWeek} />
    </main>
  );
}
