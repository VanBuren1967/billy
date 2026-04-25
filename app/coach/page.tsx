import { createClient } from '@/lib/supabase/server';

export default async function CoachDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs uppercase tracking-widest text-gold">Coach dashboard</p>
      <h1 className="font-serif text-4xl text-bone">Welcome back.</h1>
      <p className="text-bone-muted">Signed in as {user?.email}.</p>
      <p className="border-l-2 border-hairline-strong pl-3 text-sm text-bone-muted">
        Athletes, programs, and alerts will appear here once Plan 2 ships.
      </p>
    </div>
  );
}
