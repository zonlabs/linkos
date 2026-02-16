import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
// Use Anon key as per standard RLS policies
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ CRITICAL: Supabase URL or Anon Key missing in environment variables.');
}

console.log('🔌 Initializing Supabase with URL:', supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'MISSING');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    }
});
