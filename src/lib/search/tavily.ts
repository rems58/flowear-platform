import 'server-only'
import type { WebSearchFn, WebSearchResult } from '@/core/search/types'
import { getServerEnv } from '@/lib/env'

/**
 * Tavily : une recherche pensée pour les modèles, qui renvoie des extraits propres plutôt
 * que des pages entières. Choisi le 16 septembre 2026 contre Brave pour cette raison :
 * moins de tokens à faire lire au modèle pour la même information.
 *
 * `null` sans clé : le tool n'est alors pas proposé au modèle, rien ne casse.
 */
export function getWebSearch(): WebSearchFn | null {
  const key = getServerEnv().TAVILY_API_KEY
  if (!key) return null
  return async (query, { maxResults }) => {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', include_answer: false, include_raw_content: false }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`Tavily ${res.status}`)
    const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string; published_date?: string }[] }
    return (data.results ?? [])
      .filter((r): r is { title: string; url: string; content: string; published_date?: string } => typeof r.url === 'string' && typeof r.content === 'string')
      .map(
        (r): WebSearchResult => ({
          title: (r.title ?? r.url).slice(0, 200),
          url: r.url.slice(0, 500),
          content: r.content.slice(0, 1200),
          publishedAt: r.published_date,
        })
      )
  }
}
