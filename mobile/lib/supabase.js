// Supabase client for the VTM CRM mobile app — same project and accounts as
// the web CRM. Sessions persist in AsyncStorage so login survives restarts.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ssllepovajmohdhvhzsa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzbGxlcG92YWptb2hkaHZoenNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTYwMTcsImV4cCI6MjA5MTA3MjAxN30.qFTsGzZsN5XVX_xgxpdclWmeEtCs1ZfmmLzOsmcN_0k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
