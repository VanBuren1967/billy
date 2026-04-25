import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; supabase: SupabaseClient; user: User | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Calling getUser() validates the JWT and rotates expired refresh tokens — required so
  // downstream Route Handlers, Server Actions, and Server Components see a fresh session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, supabase, user };
}
