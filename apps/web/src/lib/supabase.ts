import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Wait until MSW is listening (bypass) so the PKCE token POST to *.supabase.co
    // is not in-flight while the mock worker activates.
    skipAutoInitialize: true,
  },
});

export function initializeAuth() {
  return supabase.auth.initialize();
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
