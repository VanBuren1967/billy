'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Props = {
  activeTab: 'programs' | 'templates';
  includeArchived: boolean;
  blockFilter: string | null;
};

export function ProgramsTabs({ activeTab, includeArchived, blockFilter }: Props) {
  const sp = useSearchParams();

  const tabLink = (t: 'programs' | 'templates') => {
    const params = new URLSearchParams(sp.toString());
    params.set('tab', t);
    return `/coach/programs?${params.toString()}`;
  };

  const archivedLink = () => {
    const params = new URLSearchParams(sp.toString());
    if (includeArchived) params.delete('archived');
    else params.set('archived', '1');
    return `/coach/programs?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-6 border-b border-[#1f1d18] pb-3">
      <Link
        href={tabLink('programs')}
        className={
          activeTab === 'programs'
            ? 'text-gold border-gold border-b text-sm tracking-wider uppercase'
            : 'text-bone-muted text-sm tracking-wider uppercase'
        }
      >
        Programs
      </Link>
      <Link
        href={tabLink('templates')}
        className={
          activeTab === 'templates'
            ? 'text-gold border-gold border-b text-sm tracking-wider uppercase'
            : 'text-bone-muted text-sm tracking-wider uppercase'
        }
      >
        Templates
      </Link>

      <div className="ml-auto flex items-center gap-4 text-xs">
        <Link href={archivedLink()} className="text-bone-faint hover:text-bone-muted">
          {includeArchived ? '✓ Showing archived' : 'Show archived'}
        </Link>
        <BlockFilter active={blockFilter} />
      </div>
    </div>
  );
}

function BlockFilter({ active }: { active: string | null }) {
  const sp = useSearchParams();
  const make = (block: string | null) => {
    const params = new URLSearchParams(sp.toString());
    if (block === null) params.delete('block');
    else params.set('block', block);
    return `/coach/programs?${params.toString()}`;
  };
  const opts = ['hypertrophy', 'strength', 'peak', 'general'] as const;
  return (
    <div className="flex items-center gap-2">
      <Link
        href={make(null)}
        className={active === null ? 'text-bone' : 'text-bone-faint hover:text-bone-muted'}
      >
        All
      </Link>
      {opts.map((o) => (
        <Link
          key={o}
          href={make(o)}
          className={active === o ? 'text-bone' : 'text-bone-faint hover:text-bone-muted'}
        >
          {o}
        </Link>
      ))}
    </div>
  );
}
