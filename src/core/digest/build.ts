import type { AppDefinition } from '@/apps/types'
import type { Repo } from '@/core/data/repo'
import { pick, type Locale } from '@/core/i18n/locale'

/**
 * Digest hebdomadaire : ce que chaque IA a retenu et produit pour la personne cette semaine.
 * Déclencheur externe (Eyal) qui rappelle l'investissement déposé. Vide = pas d'email.
 */
export interface AppDigest {
  slug: string
  name: string
  messages: number
  notes: string[]
  artifacts: { type: string; title: string }[]
}

export interface Digest {
  apps: AppDigest[]
  totalNotes: number
  totalArtifacts: number
  totalMessages: number
}

export async function buildDigest(repo: Repo, userId: string, apps: readonly AppDefinition[], locale: Locale, since: Date): Promise<Digest> {
  const out: AppDigest[] = []
  for (const app of apps) {
    const profile = await repo.profiles.get(userId, app.slug)
    if (!profile || profile.status !== 'active') continue
    const [messages, notes, artifacts] = await Promise.all([
      repo.usage.countMessagesSince(userId, app.slug, since),
      repo.notes.listSince(userId, app.slug, since, 8),
      repo.artifacts.listSince(userId, app.slug, since, 8),
    ])
    if (messages === 0 && notes.length === 0 && artifacts.length === 0) continue
    out.push({
      slug: app.slug,
      name: pick(app.name, locale),
      messages,
      notes: notes.map((n) => n.content),
      artifacts: artifacts.map((a) => ({ type: a.type, title: a.title })),
    })
  }
  return {
    apps: out,
    totalNotes: out.reduce((s, a) => s + a.notes.length, 0),
    totalArtifacts: out.reduce((s, a) => s + a.artifacts.length, 0),
    totalMessages: out.reduce((s, a) => s + a.messages, 0),
  }
}

export function isEmptyDigest(d: Digest): boolean {
  return d.apps.length === 0
}
