const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_SUPABASE_URL = 'https://hazkqphgdkklsvkrhubg.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_TODq1gSkK5bu8InyIJRtVQ_vB7u8zsZ';

export const env = {
  apiUrl: import.meta.env.VITE_API_URL || DEFAULT_API_URL,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  supabasePublishableKey:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
  useMsw: import.meta.env.VITE_USE_MSW === 'true',
};
