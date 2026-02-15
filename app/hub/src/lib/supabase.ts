import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

console.log('🔌 Initializing Supabase with URL:', supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'MISSING');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ CRITICAL: Supabase URL or Anon Key missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
