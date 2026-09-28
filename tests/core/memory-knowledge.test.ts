import { describe, expect, it } from 'vitest'
import { chunkMarkdown, searchKnowledge, tokenize } from '@/core/knowledge/search'
import { dedupeFacts, parseMemoryFacts, parseMemoryUpdate } from '@/core/memory/extract'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { defineApp } from '@/apps/types'
import { buildSystemPrompt } from '@/core/memory/system-prompt'

const md = `# Rétinol
Le rétinol s'introduit deux soirs par semaine, jamais avec un acide le même soir.

## Peau sensible
Commencer à 0,1 %, appliquer sur peau sèche, crème hydratante par-dessus.

# Protection solaire
SPF 50 chaque matin, même en hiver. Renouveler toutes les deux heures dehors.
`

describe('base de connaissances', () => {
  it('découpe par titre et retire les mots vides', () => {
    const chunks = chunkMarkdown('skincare', md)
    expect(chunks.map((c) => c.heading)).toEqual(['Rétinol', 'Peau sensible', 'Protection solaire'])
    expect(tokenize('Le rétinol et la peau')).toEqual(['retinol', 'peau'])
  })
  it('retrouve le bon passage pour une question, rien pour un sujet absent', () => {
    const chunks = chunkMarkdown('skincare', md)
    expect(searchKnowledge(chunks, 'je commence le rétinol avec une peau sensible', 2).map((c) => c.heading)).toEqual(['Peau sensible', 'Rétinol'])
    expect(searchKnowledge(chunks, 'quelle crème solaire le matin', 1)[0].heading).toBe('Protection solaire')
    expect(searchKnowledge(chunks, 'recette de tarte aux pommes')).toEqual([])
  })
})

describe('mémoire automatique', () => {
  it('parse un tableau JSON même entouré de texte, borne à 3 faits', () => {
    expect(parseMemoryFacts('Voici : ["Court trois fois par semaine", "Vit à Lyon", "Aime le vélo", "Quatrième"]')).toHaveLength(3)
    expect(parseMemoryFacts('[]')).toEqual([])
    expect(parseMemoryFacts('pas de json')).toEqual([])
    expect(parseMemoryFacts('["ok"]')).toEqual([])
  })
  it('lit un objet add/forget, tolère un simple tableau', () => {
    expect(parseMemoryUpdate('{"add": ["Se lève à 8h"], "forget": [2, 0, "x"]}')).toEqual({ add: ['Se lève à 8h'], forget: [2] })
    expect(parseMemoryUpdate('Voici : {"add": [], "forget": []}')).toEqual({ add: [], forget: [] })
    expect(parseMemoryUpdate('["Vit à Lyon"]')).toEqual({ add: ['Vit à Lyon'], forget: [] })
  })
  it('écarte les faits déjà connus', () => {
    const existing = [{ id: '1', userId: 'u', appSlug: 'a', content: 'Court trois fois par semaine.', source: 'ai' as const, createdAt: '' }]
    expect(dedupeFacts(['court trois fois par semaine', 'Vit à Lyon', 'vit à lyon'], existing)).toEqual(['Vit à Lyon'])
  })
  it('le dépôt permet de corriger et d’oublier ses propres souvenirs seulement', async () => {
    const { repo } = createMemoryRepo()
    const n = await repo.notes.add('u1', 'remy', 'Aime le vélo', 'user')
    expect((await repo.notes.update(n.id, 'u2', 'pirate'))).toBeNull()
    expect((await repo.notes.update(n.id, 'u1', 'Aime le vélo de route'))?.content).toBe('Aime le vélo de route')
    expect(await repo.notes.remove(n.id, 'u2')).toBe(false)
    expect(await repo.notes.remove(n.id, 'u1')).toBe(true)
    await repo.profiles.upsert('u1', 'remy', { firstName: 'Rémy', budget: '50' }, 'active')
    expect((await repo.profiles.removeKey('u1', 'remy', 'budget'))?.data).toEqual({ firstName: 'Rémy' })
  })
})

describe('prompt avec connaissances et productions', () => {
  it('injecte les passages et la liste des productions', () => {
    const app = defineApp({
      slug: 'test-app',
      name: 'Test',
      tagline: 'x',
      persona: { system: 'Tu es un assistant de test qui répond court.' },
      onboarding: { questions: [{ type: 'text', key: 'firstName', label: 'Prénom' }] },
      tools: { enabled: [] },
      pwa: { shortName: 'T', themeColor: '#000000', backgroundColor: '#ffffff' },
    })
    const prompt = buildSystemPrompt({
      app,
      locale: 'fr',
      profile: {},
      notes: [],
      artifacts: [{ type: 'fiche', title: 'Routine du matin', createdAt: '' }],
      knowledge: chunkMarkdown('skincare', md).slice(0, 1),
      toolNames: [],
      plan: 'free',
    })
    expect(prompt).toContain('fiche : Routine du matin')
    expect(prompt).toContain('deux soirs par semaine')
  })
})
