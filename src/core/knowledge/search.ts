/**
 * Base de connaissances d'une IA : des fichiers Markdown dans `src/apps/<slug>/knowledge/`,
 * découpés par titre, puis les passages les plus proches de la question sont injectés
 * dans le prompt (et interrogeables via le tool `search_knowledge`).
 * Recherche lexicale pure, sans embeddings ni service externe : zéro coût, zéro clé.
 */
export interface KnowledgeChunk {
  id: string
  source: string
  heading: string
  text: string
  terms: Set<string>
}

const STOP = new Set(
  'le la les un une des du de et ou à a au aux en pour par sur avec sans dans que qui quoi ce cette ces son sa ses mon ma mes ton ta tes est sont être avoir il elle on nous vous ils elles ne pas plus the of and to in is are for with'.split(' ')
)

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}

/** Découpe un fichier Markdown en passages : un par titre (#, ##, ###), bornés en taille. */
export function chunkMarkdown(source: string, markdown: string, maxChars = 1500): KnowledgeChunk[] {
  const lines = markdown.split('\n')
  const chunks: KnowledgeChunk[] = []
  let heading = source
  let buffer: string[] = []
  let index = 0

  const flush = () => {
    const text = buffer.join('\n').trim()
    buffer = []
    if (!text) return
    // Des paragraphes regroupés jusqu'à `maxChars` : un texte collé sans titres (mode simple du
    // Studio) se découpe entre deux paragraphes, pas au milieu d'une phrase.
    const push = (part: string) => chunks.push({ id: `${source}#${index++}`, source, heading, text: part, terms: new Set(tokenize(`${heading} ${part}`)) })
    let current = ''
    for (const paragraph of text.split(/\n\s*\n/)) {
      const p = paragraph.trim()
      if (!p) continue
      if (current && current.length + p.length + 2 > maxChars) {
        push(current)
        current = ''
      }
      if (p.length > maxChars) {
        for (let i = 0; i < p.length; i += maxChars) push(p.slice(i, i + maxChars))
        continue
      }
      current = current ? `${current}\n\n${p}` : p
    }
    if (current) push(current)
  }

  for (const line of lines) {
    const m = /^#{1,3}\s+(.+)$/.exec(line)
    if (m) {
      flush()
      heading = m[1].trim()
    } else {
      buffer.push(line)
    }
  }
  flush()
  return chunks
}

/** Score = termes de la question présents dans le passage, pondérés par leur rareté dans le corpus. */
export function searchKnowledge(chunks: readonly KnowledgeChunk[], query: string, topK = 3): KnowledgeChunk[] {
  const q = Array.from(new Set(tokenize(query)))
  if (q.length === 0 || chunks.length === 0) return []
  const df = new Map<string, number>()
  for (const c of chunks) for (const t of c.terms) df.set(t, (df.get(t) ?? 0) + 1)
  const n = chunks.length
  const scored = chunks
    .map((c) => {
      let score = 0
      for (const t of q) if (c.terms.has(t)) score += Math.log(1 + n / (df.get(t) ?? 1))
      return { c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map((x) => x.c)
}
