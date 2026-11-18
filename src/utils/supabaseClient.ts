import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Safe initialization with environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl.trim() !== '' && supabaseAnonKey.trim() !== '') {
  try {
    client = createClient(supabaseUrl.trim(), supabaseAnonKey.trim(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (err) {
    console.warn('[SupabaseClient] Failed to initialize Supabase client:', err);
    client = null;
  }
}

export const supabase = client;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
