import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  // Role-based landing handled by middleware on next request; for now, send to /app.
  // Real role redirect lives in Task 11 once `getUserRole` exists.
  return NextResponse.redirect(`${url.origin}/app`);
}
