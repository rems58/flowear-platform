import { describe, expect, it } from 'vitest'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { studioSignupSchema } from '@/core/studio/waitlist'

describe('Flowear Studio : liste d’attente', () => {
  it('valide et normalise une inscription', () => {
    const parsed = studioSignupSchema.parse({ email: '  Lea@Example.com ', idea: '  Une IA sommeil pour jeunes parents ', audience: '12k TikTok', locale: 'fr' })
    expect(parsed).toEqual({ email: 'lea@example.com', idea: 'Une IA sommeil pour jeunes parents', audience: '12k TikTok', locale: 'fr' })
    expect(studioSignupSchema.safeParse({ email: 'pas-un-email', idea: 'x', locale: 'fr' }).success).toBe(false)
    expect(studioSignupSchema.safeParse({ email: 'a@b.fr', idea: '', locale: 'fr' }).success).toBe(false)
    expect(studioSignupSchema.safeParse({ email: 'a@b.fr', idea: 'x'.repeat(301), locale: 'fr' }).success).toBe(false)
    expect(studioSignupSchema.safeParse({ email: 'a@b.fr', idea: 'ok', locale: 'xx' }).success).toBe(false)
  })

  it('un email ne s’inscrit qu’une fois, le compteur suit', async () => {
    const { repo } = createMemoryRepo()
    expect(await repo.studioWaitlist.count()).toBe(0)
    expect(await repo.studioWaitlist.add({ email: 'lea@example.com', idea: 'IA sommeil', audience: null, locale: 'fr', utm: { source: 'linkedin' } })).toBe('added')
    expect(await repo.studioWaitlist.add({ email: 'lea@example.com', idea: 'autre idée', audience: null, locale: 'fr', utm: null })).toBe('exists')
    expect(await repo.studioWaitlist.add({ email: 'max@example.com', idea: 'IA nutrition', audience: '3k IG', locale: 'en', utm: null })).toBe('added')
    expect(await repo.studioWaitlist.count()).toBe(2)
    const rows = await repo.studioWaitlist.list(10)
    expect(rows.map((r) => r.email)).toEqual(['max@example.com', 'lea@example.com'])
    expect(rows[1].utm).toEqual({ source: 'linkedin' })
  })
})
