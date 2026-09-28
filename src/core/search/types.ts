/**
 * Recherche web vue du cœur : une fonction, un résultat. Le fournisseur (Tavily) vit
 * dans `src/lib/search`, le cœur ne le connaît pas, les tests le remplacent.
 */
export interface WebSearchResult {
  title: string
  url: string
  /** Extrait pertinent, déjà borné par le fournisseur. */
  content: string
  publishedAt?: string
}

export interface WebSearchOptions {
  maxResults: number
  /** Langue de la personne : oriente les résultats, ne les filtre pas. */
  locale: string
}

export type WebSearchFn = (query: string, options: WebSearchOptions) => Promise<WebSearchResult[]>

/**
 * Coût d'un appel, en dollars, ajouté au coût du message pour les plafonds et l'admin.
 * Tavily : 8 $ les mille recherches en paiement à l'usage.
 */
export const WEB_SEARCH_COST_USD = 0.008
