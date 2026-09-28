import 'server-only'
import type { Repo } from '@/core/data/repo'
import { getSupabaseAdmin } from './client'
import { createSupabaseRepo } from './supabase-repo'

let repo: Repo | null = null

/** Dépôt de production, un par processus. */
export function getRepo(): Repo {
  if (!repo) repo = createSupabaseRepo(getSupabaseAdmin())
  return repo
}
