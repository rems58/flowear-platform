import { afterEach, describe, expect, it } from 'vitest'
import { getApp, isAppSlug, listApps, listPublicApps } from '@/apps/registry'
import { clearStoredApps, storedKnowledge } from '@/core/apps/store'
import { assertSlugAvailable, isReservedSlug } from '@/core/apps/reserved'
import { loadCreatorAppsInto } from '@/core/apps/load'
import { sanitizeCreatorManifest } from '@/core/studio/manifest'
import { CREATOR_FREE_MESSAGES_PER_DAY } from '@/core/studio/waitlist'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { resolveConfig } from '@/core/config/resolve'
import { chunkMarkdown, searchKnowledge } from '@/core/knowledge/search'

const manifest = {
  slug: 'sommeil',
  name: 'Sommeil',
  tagline: 'Un coach sommeil pour jeunes parents.',
  persona: { system: 'Tu es un coach sommeil pour jeunes parents. Tu réponds avec douceur, une seule question à la fois, et tu ne donnes jamais de conseil médical.' },
  onboarding: { questions: [{ type: 'text' as const, key: 'baby_age', label: 'Âge du bébé' }] },
  tools: { enabled: ['schedule_checkin'] },
  pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
}

async function publishedRepo(overrides: Partial<typeof manifest> = {}) {
  const { repo } = createMemoryRepo()
  await repo.creatorApps.saveDraft({ slug: 'sommeil', ownerId: 'creator_1', manifest: { ...manifest, ...overrides }, knowledge: [{ name: 'siestes', markdown: '# Siestes\nÀ 6 mois, deux siestes par jour suffisent souvent.' }] })
  await repo.creatorApps.publish('sommeil', 'admin_1')
  return repo
}

describe('IA créateurs : registre à deux sources', () => {
  afterEach(() => clearStoredApps())

  it('une IA publiée en base apparaît sur le hub et répond à getApp', async () => {
    const repo = await publishedRepo()
    expect(getApp('sommeil')).toBeUndefined()
    const loaded = await loadCreatorAppsInto(repo)
    expect(loaded.loaded).toBe(1)
    expect(getApp('sommeil')?.slug).toBe('sommeil')
    expect(isAppSlug('sommeil')).toBe(true)
    expect(listApps().some((a) => a.slug === 'sommeil')).toBe(true)
    expect(listPublicApps().some((a) => a.slug === 'sommeil')).toBe(true)
    // Les IA du code restent devant.
    expect(listApps()[0].slug).toBe('remy')
  })

  it('une IA suspendue disparaît au rechargement', async () => {
    const repo = await publishedRepo()
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')).toBeDefined()
    await repo.creatorApps.suspend('sommeil', 'admin_1', 'plainte')
    await loadCreatorAppsInto(repo)
    expect(getApp('sommeil')).toBeUndefined()
  })

  it('un manifeste invalide en base est ignoré sans casser les autres', async () => {
    const repo = await publishedRepo()
    await repo.creatorApps.saveDraft({ slug: 'casse', ownerId: 'creator_2', manifest: { ...manifest, slug: 'casse', persona: { system: 'court' } }, knowledge: [] })
    await repo.creatorApps.publish('casse', 'admin_1')
    const result = await loadCreatorAppsInto(repo)
    expect(result.loaded).toBe(1)
    expect(result.rejected).toEqual(['casse'])
    expect(getApp('sommeil')).toBeDefined()
    expect(getApp('casse')).toBeUndefined()
  })

  it('les connaissances publiées sont indexées et cherchables', async () => {
    const repo = await publishedRepo()
    await loadCreatorAppsInto(repo)
    const chunks = storedKnowledge('sommeil')
    expect(chunks.length).toBeGreaterThan(0)
    expect(searchKnowledge(chunks, 'combien de siestes à 6 mois')[0]?.text).toContain('deux siestes')
  })

  it('les slugs du code et de l’application sont réservés', () => {
    for (const slug of ['remy', 'amorce', 'admin', 'api', 'studio', 'pricing', 'sign-in', 'flowear-admin', 'flowear']) {
      expect(isReservedSlug(slug)).toBe(true)
    }
    expect(isReservedSlug('sommeil')).toBe(false)
    expect(() => assertSlugAvailable('amorce')).toThrow()
    expect(() => assertSlugAvailable('Bad Slug')).toThrow()
    expect(() => assertSlugAvailable('sommeil')).not.toThrow()
  })

  it('le manifeste d’un créateur ne peut pas porter ce que le serveur impose', () => {
    const clean = sanitizeCreatorManifest({
      ...manifest,
      access: 'private',
      brand: { from: '#000000', to: '#ffffff', glyph: 'S', mark: '<path d="M0 0h64v64H0z"/>' },
      config: { models: { order: ['openai'] } },
      plans: { paid: { messagesPerDay: 100000 } },
      kill: { d7RetentionMin: 0, signupsPer10CarouselsMin: 0, reviewAfterWeeks: 1 },
      tools: { enabled: ['schedule_checkin', 'web_search', 'admin_only_tool'] },
    } as never)
    expect(clean.access).toBe('public')
    expect(clean.brand?.mark).toBeUndefined()
    expect(clean.brand?.glyph).toBe('S')
    expect(clean.config).toBeUndefined()
    expect(clean.kill).toBeUndefined()
    expect(clean.tools.enabled).toEqual(['schedule_checkin'])
    expect(clean.plans?.free?.messagesPerDay).toBe(CREATOR_FREE_MESSAGES_PER_DAY)
    expect(clean.plans?.paid).toBeUndefined()
  })

  it('le gratuit d’une IA créateur est à trois messages par jour, le reste vient des réglages', async () => {
    const repo = await publishedRepo()
    await loadCreatorAppsInto(repo)
    const config = resolveConfig(getApp('sommeil')!, [])
    expect(config.plans.free.messagesPerDay).toBe(3)
    expect(config.plans.paid.messagesPerDay).toBe(150)
  })

  it('un logo en image PNG ou JPEG est gardé ; un SVG ou autre chose est retiré', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const keep = sanitizeCreatorManifest({ ...manifest, brand: { from: '#000000', to: '#ffffff', glyph: 'S', image: png } } as never)
    expect(keep.brand?.image).toBe(png)
    const svg = sanitizeCreatorManifest({ ...manifest, brand: { from: '#000000', to: '#ffffff', glyph: 'S', image: 'data:image/svg+xml;base64,PHN2Zy8+' } } as never)
    expect(svg.brand?.image).toBeUndefined()
  })

  it('un texte collé sans titres est découpé entre deux paragraphes, jamais au milieu d’une phrase', () => {
    const para = (n: number) => `Paragraphe ${n}. ` + 'mot '.repeat(150).trim() + '.'
    const chunks = chunkMarkdown('savoir', [1, 2, 3, 4].map(para).join('\n\n'))
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.text.trim().endsWith('.')).toBe(true)
  })
})
