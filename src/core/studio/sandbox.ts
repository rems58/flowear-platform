import type { UIMessage } from 'ai'
import { defineApp, type AppDefinition, type AppManifestInput, type OnboardingQuestion } from '@/apps/types'
import { handleChat, type ChatDeps } from '@/core/agent/chat'
import { createMemoryRepo } from '@/core/data/memory-repo'
import type { Repo } from '@/core/data/repo'
import type { CreatorKnowledgeFile } from '@/core/data/types'
import type { Locale } from '@/core/i18n/locale'
import { chunkMarkdown } from '@/core/knowledge/search'
import { sanitizeCreatorManifest } from './manifest'

/** Les dépendances de la boucle agent, sans dépôt : le bac à sable fournit le sien. */
export type SandboxDeps = Omit<ChatDeps, 'repo' | 'knowledge'>

export interface SandboxInput {
  manifest: AppManifestInput
  knowledge: CreatorKnowledgeFile[]
  ownerId: string
  locale: Locale
  timezone?: string
}

export interface SandboxHistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export interface Sandbox {
  app: AppDefinition
  repo: Repo
  userId: string
  /** Un tour de conversation, en streaming, exactement comme la route de production. */
  send(message: string, options?: { conversationId?: string | null; history?: SandboxHistoryItem[] }): Promise<Response>
}

/** Une réponse plausible par question d'onboarding : le profil jetable du bac à sable. */
export function sampleProfile(questions: readonly OnboardingQuestion[]): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const q of questions) {
    if (q.type === 'text') data[q.key] = 'Test'
    else if (q.type === 'choice') data[q.key] = q.options[0]?.value
    else if (q.type === 'multi') data[q.key] = [q.options[0]?.value]
    else if (q.type === 'number') data[q.key] = q.min
  }
  return data
}

/**
 * Bac à sable : le brouillon devient une IA en mémoire, la boucle agent de production tourne
 * dessus avec un dépôt mémoire et un utilisateur synthétique. Rien n'est écrit en base, rien
 * n'est mémorisé d'un appel à l'autre : le client renvoie l'historique, le serveur le ressème.
 * Le manifeste passe par le même nettoyage qu'à la publication : le créateur teste ce qui
 * sera réellement en ligne, pas une version plus permissive.
 */
export async function createSandbox(deps: SandboxDeps, input: SandboxInput): Promise<Sandbox> {
  const app = defineApp(sanitizeCreatorManifest(input.manifest))
  const { repo } = createMemoryRepo()
  const userId = `sandbox:${input.ownerId}`
  await repo.users.upsert({ clerkUserId: userId, locale: input.locale })
  await repo.profiles.upsert(userId, app.slug, sampleProfile(app.onboarding.questions), 'active')
  const knowledge = input.knowledge.flatMap((f) => chunkMarkdown(f.name, f.markdown))
  let seq = 0

  return {
    app,
    repo,
    userId,
    async send(message, options = {}) {
      let conversationId = options.conversationId ?? null
      if (options.history?.length) {
        const conversation = await repo.conversations.create(userId, app.slug, 'Bac à sable')
        conversationId = conversation.id
        for (const item of options.history) {
          await repo.messages.append({ id: `sandbox_${++seq}`, conversationId, userId, appSlug: app.slug, role: item.role, parts: [{ type: 'text', text: item.text }] })
        }
      }
      const userMessage: UIMessage = { id: `sandbox_${++seq}`, role: 'user', parts: [{ type: 'text', text: message }] }
      return handleChat(
        { ...deps, repo, knowledge },
        { userId, app, locale: input.locale, conversationId, timezone: input.timezone, messages: [userMessage], isAdmin: true }
      )
    },
  }
}
