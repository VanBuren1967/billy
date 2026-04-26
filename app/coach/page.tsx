import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type Counts = { pending: number; invited: number; active: number };

async function loadCounts(): Promise<Counts> {
  const supabase = await createClient();
  const [pendingRes, invitedRes, activeRes] = await Promise.all([
    supabase
      .from('join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
    supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return {
    pending: pendingRes.count ?? 0,
    invited: invitedRes.count ?? 0,
    active: activeRes.count ?? 0,
  };
}

export default async function CoachDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const counts = await loadCounts();

  const cards = [
    {
      label: 'Pending requests',
      value: counts.pending,
      href: '/coach/requests',
      cta: 'Review',
    },
    {
      label: 'Active athletes',
      value: counts.active,
      href: '/coach/athletes',
      cta: 'View roster',
    },
    {
      label: 'Awaiting first sign-in',
      value: counts.invited,
      href: '/coach/athletes',
      cta: 'View roster',
    },
  ];

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Coach dashboard</p>
        <h1 className="text-bone font-serif text-4xl">Welcome back.</h1>
        <p className="text-bone-muted">Signed in as {user?.email}.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border-hairline-strong hover:border-gold focus-visible:outline-gold flex flex-col gap-3 border p-6 transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <p className="text-bone-faint text-xs tracking-widest uppercase">{c.label}</p>
            <p className="text-bone font-serif text-5xl">{c.value}</p>
            <p className="text-gold mt-2 text-xs tracking-widest uppercase">{c.cta} →</p>
          </Link>
        ))}
      </section>

      <section className="border-hairline-strong border p-6">
        <p className="text-bone-faint text-xs tracking-widest uppercase">Coming soon</p>
        <p className="text-bone-muted mt-2 text-sm">
          Programs, workout logging, weekly check-ins, and athlete alerts ship in Plan 3.
        </p>
      </section>
    </div>
  );
}
