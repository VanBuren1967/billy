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

export const SUPABASE_URL = required('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SITE_URL = required('NEXT_PUBLIC_SITE_URL');
