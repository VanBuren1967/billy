// Service-role Supabase client. Bypasses RLS. ONLY use in server actions or route
// handlers, never in RSCs or client code. Every call site MUST first verify the
// caller is authorized (e.g., via assertCoach) before using this client.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/supabase/env';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local for development, or in your Vercel project settings for production.`,
    );
  }
  return value;
}

export function createAdminClient() {
  return createClient(SUPABASE_URL, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
