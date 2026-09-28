import { z } from 'zod'
import { WEB_SEARCH_COST_USD } from '@/core/search/types'
import { wrapUntrusted } from '@/core/security/prompt-guard'
import { defineTool } from '../define'

const input = z.object({
  query: z.string().min(3).max(200).describe('Ce que tu cherches sur le web, formulé comme une requête de moteur de recherche'),
})

/**
 * Recherche web. Réservée aux plans dont `webSearch` est vrai (payant par défaut) : chaque
 * appel coûte, et son coût est ajouté à celui du message pour les plafonds.
 *
 * Les résultats reviennent enveloppés comme données : une page web peut contenir des
 * instructions, elles n'en sont pas. Le modèle cite ses sources par leur adresse.
 */
export const searchWebTool = defineTool({
  name: 'search_web',
  description:
    'Cherche sur le web des informations récentes ou que tu ne connais pas avec certitude (actualité, prix, disponibilité, faits datés). Cite les sources par leur adresse dans ta réponse. N’appelle pas cet outil pour ce que tu sais déjà.',
  input,
  cost: 'medium',
  // Une même question posée deux fois dans l'heure ne coûte qu'une recherche.
  cacheTtlSeconds: 3600,
  requiresPlan: 'free',
  requiresFeature: 'webSearch',
  render: 'text',
  async execute({ query }, ctx) {
    if (!ctx.webSearch) return { error: 'La recherche web n’est pas disponible.' }
    const results = await ctx.webSearch(query, { maxResults: 5, locale: ctx.locale })
    ctx.charge?.(WEB_SEARCH_COST_USD)
    if (results.length === 0) return { found: false, results: 'Aucun résultat.' }
    return {
      found: true,
      results: wrapUntrusted(
        'recherche_web',
        results.map((r, i) => `## ${i + 1}. ${r.title}\nAdresse : ${r.url}${r.publishedAt ? `\nDate : ${r.publishedAt}` : ''}\n${r.content}`).join('\n\n')
      ),
      sources: results.map((r) => ({ title: r.title, url: r.url })),
    }
  },
})
