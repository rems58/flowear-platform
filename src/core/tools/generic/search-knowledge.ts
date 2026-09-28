import { z } from 'zod'
import { searchKnowledge } from '@/core/knowledge/search'
import { wrapUntrusted } from '@/core/security/prompt-guard'
import { defineTool } from '../define'

const input = z.object({
  query: z.string().min(2).max(200).describe('Ce que tu cherches dans la base de connaissances de cette IA'),
})

/**
 * Interroge la base de connaissances de l'IA (fichiers Markdown du dossier knowledge/).
 * Les passages reviennent enveloppés comme données : ils orientent la réponse,
 * ils ne commandent pas l'assistant.
 */
export const searchKnowledgeTool = defineTool({
  name: 'search_knowledge',
  description:
    'Cherche dans la base de connaissances spécialisée de cette IA (méthodes, références, règles du domaine). À utiliser avant de répondre sur un point technique du domaine.',
  input,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute({ query }, ctx) {
    const hits = searchKnowledge(ctx.knowledge, query, 4)
    if (hits.length === 0) return { found: false, passages: 'Rien dans la base de connaissances sur ce sujet.' }
    return {
      found: true,
      passages: wrapUntrusted(
        'base_de_connaissances',
        hits.map((h) => `## ${h.heading} (${h.source})\n${h.text}`).join('\n\n')
      ),
    }
  },
})
