import { createClient } from '@/lib/supabase/server';
import { RequestCard } from './request-card';

export const metadata = { title: 'Requests — Steele & Co.' };

type Request = {
  id: string;
  name: string;
  email: string;
  message: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'declined';
};

export default async function RequestsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('join_requests')
    .select('id, name, email, message, created_at, status')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-bone font-serif text-3xl">Requests</h1>
        <p className="text-gold">Could not load requests: {error.message}</p>
      </div>
    );
  }

  const all = (data ?? []) as Request[];
  const pending = all.filter((r) => r.status === 'pending');
  const reviewed = all.filter((r) => r.status !== 'pending');

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Approval queue</p>
        <h1 className="text-bone font-serif text-4xl">Requests</h1>
        <p className="text-bone-muted">
          {pending.length === 0
            ? 'No pending requests.'
            : `${pending.length} pending ${pending.length === 1 ? 'request' : 'requests'}.`}
        </p>
      </header>

      {pending.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Pending</h2>
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}

      {reviewed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent decisions</h2>
          {reviewed.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </section>
      )}
    </div>
  );
}
