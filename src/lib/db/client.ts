import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServerEnv } from '@/lib/env'

let client: SupabaseClient | null = null

/**
 * Client Supabase avec la clé service, serveur uniquement.
 * Le navigateur ne parle jamais à Supabase : tout passe par les routes API,
 * qui filtrent chaque requête par utilisateur. La RLS reste activée en seconde ligne.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client
  const env = getServerEnv()
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-flowear-server': '1' } },
  })
  return client
}
