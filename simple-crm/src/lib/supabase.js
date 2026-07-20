import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Treat the placeholder values from .env.example as "not configured" so the app
// can boot into demo mode without a real backend.
const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('your-project-ref') ||
  supabaseAnonKey.includes('your-anon-key')

// When real credentials are present we run against Supabase; otherwise the app
// falls back to a local (browser-storage) data layer. See src/lib/store.js.
export const hasSupabase = !isPlaceholder

export const supabase = hasSupabase
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
