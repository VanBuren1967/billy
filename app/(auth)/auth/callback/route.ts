import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/get-user-role';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid_or_expired`);
  }

  const role = await getUserRole(supabase);
  if (role.kind === 'coach') return NextResponse.redirect(`${url.origin}/coach`);
  if (role.kind === 'athlete') return NextResponse.redirect(`${url.origin}/app`);
  // Unlinked accounts: send to a friendly holding page (built in Plan 2).
  return NextResponse.redirect(`${url.origin}/login?error=account_not_yet_linked`);
}
