import { createClient } from '@/lib/supabase/server';

export default async function CoachDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-gold text-xs tracking-widest uppercase">Coach dashboard</p>
      <h1 className="text-bone font-serif text-4xl">Welcome back.</h1>
      <p className="text-bone-muted">Signed in as {user?.email}.</p>
      <p className="border-hairline-strong text-bone-muted border-l-2 pl-3 text-sm">
        Athletes, programs, and alerts will appear here once Plan 2 ships.
      </p>
    </div>
  );
}
