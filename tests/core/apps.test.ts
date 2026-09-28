import { describe, expect, it } from 'vitest'
import { buildProfileSchema, defineApp } from '@/apps/types'
import { getApp, isAppSlug, listApps } from '@/apps/registry'

describe('defineApp', () => {
  it('refuse un slug invalide', () => {
    expect(() =>
      defineApp({
        slug: 'Bad Slug',
        name: 'x',
        tagline: 'x',
        persona: { system: 'Un system prompt assez long pour passer.' },
        onboarding: { questions: [{ type: 'text', key: 'a', label: 'A' }] },
        tools: { enabled: [] },
        pwa: { shortName: 'x', themeColor: '#000000', backgroundColor: '#ffffff' },
      })
    ).toThrow()
  })

  it('limite l’onboarding à trois questions', () => {
    expect(() =>
      defineApp({
        slug: 'ok',
        name: 'x',
        tagline: 'x',
        persona: { system: 'Un system prompt assez long pour passer.' },
        onboarding: {
          questions: [
            { type: 'text', key: 'a', label: 'A' },
            { type: 'text', key: 'b', label: 'B' },
            { type: 'text', key: 'c', label: 'C' },
            { type: 'text', key: 'd', label: 'D' },
          ],
        },
        tools: { enabled: [] },
        pwa: { shortName: 'x', themeColor: '#000000', backgroundColor: '#ffffff' },
      })
    ).toThrow()
  })
})

describe('buildProfileSchema', () => {
  const schema = buildProfileSchema([
    { type: 'text', key: 'firstName', label: 'Prénom', required: true, maxLength: 10 },
    { type: 'choice', key: 'style', label: 'Style', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], required: true },
    { type: 'multi', key: 'tags', label: 'Tags', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }], required: false, max: 1 },
    { type: 'number', key: 'age', label: 'Âge', min: 0, max: 120, required: false },
  ])

  it('accepte un profil valide', () => {
    expect(schema.safeParse({ firstName: 'Rémy', style: 'a', tags: ['x'], age: 30 }).success).toBe(true)
  })
  it('refuse une valeur hors options, un texte trop long, une clé inconnue', () => {
    expect(schema.safeParse({ firstName: 'Rémy', style: 'z' }).success).toBe(false)
    expect(schema.safeParse({ firstName: 'Un prénom beaucoup trop long', style: 'a' }).success).toBe(false)
    expect(schema.safeParse({ firstName: 'Rémy', style: 'a', hack: true }).success).toBe(false)
    expect(schema.safeParse({ firstName: 'Rémy', style: 'a', tags: ['x', 'y'] }).success).toBe(false)
  })
})

describe('registre des apps', () => {
  it('contient Rémy et rien d’inconnu', () => {
    expect(isAppSlug('remy')).toBe(true)
    expect(isAppSlug('inconnu')).toBe(false)
    expect(getApp('remy')?.name).toBe('Rémy')
    expect(listApps().map((a) => a.slug)).toContain('remy')
  })
})
