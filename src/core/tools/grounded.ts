/**
 * Un modèle à qui l'on demande d'extraire des choses d'un message en invente parfois quand il
 * n'y en a pas (« désolé j'ai tout lâché » → une tâche « Lister les tâches en suspens »).
 * Ce filtre garde un élément seulement s'il partage avec le message un mot porteur (quatre
 * lettres ou plus, sans accents) ou un nombre. Une reformulation garde toujours un nom
 * (« dentiste », « CAF », « cuisine ») ; une invention n'en partage aucun.
 */
const STOP = new Set(['dans', 'pour', 'avec', 'sans', 'chez', 'mais', 'donc', 'puis', 'trop', 'tout', 'tous', 'toute', 'toutes', 'cette', 'cela', 'être', 'avoir', 'faire', 'fait', 'aller', 'that', 'this', 'with', 'from', 'have', 'been', 'will', 'para', 'como', 'pero', 'esta', 'este', 'nicht', 'auch', 'aber', 'eine', 'einen', 'sind', 'della', 'delle', 'anche', 'sono', 'chose', 'choses', 'truc', 'trucs'])

function words(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const out = new Set<string>()
  for (const w of norm.match(/[a-z0-9]+/g) ?? []) {
    if (/^\d+$/.test(w) || (w.length >= 4 && !STOP.has(w))) out.add(w)
  }
  return out
}

/** Vrai si `candidate` partage au moins un mot porteur ou un nombre avec `source`. */
export function isGroundedIn(candidate: string, source: string): boolean {
  const s = words(source)
  if (s.size === 0) return false
  for (const w of words(candidate)) {
    if (s.has(w)) return true
    // Racines : « rappeler » et « rappelle », « factures » et « facture ».
    for (const x of s) if (x.length >= 5 && w.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))) return true
  }
  return false
}

/** Garde les éléments ancrés dans le message ; sans message connu, garde tout. */
export function groundedItems<T>(items: readonly T[], source: string | undefined, text: (item: T) => string): T[] {
  if (!source) return [...items]
  return items.filter((it) => isGroundedIn(text(it), source))
}
