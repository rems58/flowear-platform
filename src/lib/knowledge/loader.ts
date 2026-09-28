import 'server-only'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { storedKnowledge } from '@/core/apps/store'
import { chunkMarkdown, type KnowledgeChunk } from '@/core/knowledge/search'

const cache = new Map<string, KnowledgeChunk[]>()

/**
 * Connaissances d'une IA : les fichiers `src/apps/<slug>/knowledge/*.md` pour une IA du code
 * (lus une fois par processus ; ajouter un fichier = redéployer), le magasin pour une IA
 * créateur (`published_knowledge`, déjà découpé au chargement du registre).
 */
export async function loadKnowledge(slug: string): Promise<KnowledgeChunk[]> {
  const fromStore = storedKnowledge(slug)
  if (fromStore.length) return fromStore
  const cached = cache.get(slug)
  if (cached && process.env.NODE_ENV === 'production') return cached
  const dir = path.join(process.cwd(), 'src', 'apps', slug, 'knowledge')
  let files: string[] = []
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    cache.set(slug, [])
    return []
  }
  const chunks: KnowledgeChunk[] = []
  for (const f of files) {
    const md = await readFile(path.join(dir, f), 'utf8')
    chunks.push(...chunkMarkdown(f.replace(/\.md$/, ''), md))
  }
  cache.set(slug, chunks)
  return chunks
}
