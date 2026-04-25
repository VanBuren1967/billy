import { createClient } from '@/lib/supabase/server';

export default async function AthleteDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs uppercase tracking-widest text-gold">Today</p>
      <h1 className="font-serif text-4xl text-bone">Welcome back.</h1>
      <p className="text-bone-muted">Signed in as {user?.email}.</p>
      <p className="border-l-2 border-hairline-strong pl-3 text-sm text-bone-muted">
        Your program and check-ins will appear here once Plan 3 ships.
      </p>
    </div>
  );
}
