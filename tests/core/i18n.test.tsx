// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { remyApp } from '@/apps/remy/manifest'
import { resolveQuestion } from '@/apps/types'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectLocale, pick } from '@/core/i18n/locale'
import { buildSystemPrompt } from '@/core/memory/system-prompt'
import { defaultTitle } from '@/core/agent/title'
import { MESSAGES, errorMessage, fmt, getMessages } from '@/lib/i18n/messages'
import { I18nProvider, useI18n } from '@/lib/i18n/provider'
import { toPublicApp } from '@/lib/public-app'

/** Toutes les feuilles d'un dictionnaire : « chat.greeting », « errors.QUOTA_EXCEEDED »... */
function leaves(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : leaves(v as Record<string, unknown>, `${prefix}${k}.`)
  )
}

describe('langues', () => {
  it('cinq langues, anglais par défaut', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(['de', 'en', 'es', 'fr', 'it'])
    expect(DEFAULT_LOCALE).toBe('en')
  })

  it('détecte la langue du navigateur, sinon anglais', () => {
    expect(detectLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr')
    expect(detectLocale('it-IT,it;q=0.9')).toBe('it')
    expect(detectLocale('de')).toBe('de')
    expect(detectLocale('es-MX')).toBe('es')
    expect(detectLocale('pt-BR,pt;q=0.9,es;q=0.5')).toBe('es')
    expect(detectLocale('ja,zh;q=0.8')).toBe('en')
    expect(detectLocale('')).toBe('en')
    expect(detectLocale(null)).toBe('en')
    expect(detectLocale('fr;q=0,en;q=0.5')).toBe('en')
  })

  it('chaque dictionnaire a exactement les clés de l’anglais, sans valeur vide', () => {
    const reference = leaves(MESSAGES.en).sort()
    expect(reference.length).toBeGreaterThan(50)
    for (const locale of SUPPORTED_LOCALES) {
      const keys = leaves(MESSAGES[locale]).sort()
      expect(keys, `clés manquantes ou en trop dans ${locale}`).toEqual(reference)
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], MESSAGES[locale])
        expect(String(value).trim(), `${locale}: ${key} vide`).not.toBe('')
      }
    }
  })

  it('les variables sont les mêmes dans toutes les langues', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    for (const key of leaves(MESSAGES.en)) {
      const read = (locale: (typeof SUPPORTED_LOCALES)[number]) =>
        String(key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], MESSAGES[locale]))
      for (const locale of SUPPORTED_LOCALES) expect(vars(read(locale)), `${locale}: ${key}`).toBe(vars(read('en')))
    }
  })

  it('aucun tiret cadratin dans les textes', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of leaves(MESSAGES[locale])) {
        const value = String(key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], MESSAGES[locale]))
        expect(value, `${locale}: ${key}`).not.toContain('—')
      }
    }
  })

  it('interpole et traduit les erreurs par code', () => {
    expect(fmt('Salut {name}.', { name: 'Rémy' })).toBe('Salut Rémy.')
    expect(fmt('{a} {b}', { a: 1 })).toBe('1 {b}')
    expect(errorMessage(getMessages('de'), 'QUOTA_EXCEEDED', 'brut')).toBe(MESSAGES.de.errors.QUOTA_EXCEEDED)
    expect(errorMessage(getMessages('es'), 'INCONNU', 'message serveur')).toBe('message serveur')
    expect(errorMessage(getMessages('it'), undefined)).toBe(MESSAGES.it.common.error)
  })
})

describe('manifeste multilingue', () => {
  it('Rémy existe dans les cinq langues, textes distincts', () => {
    const taglines = SUPPORTED_LOCALES.map((l) => toPublicApp(remyApp, l).tagline)
    expect(new Set(taglines).size).toBe(5)
    for (const locale of SUPPORTED_LOCALES) {
      const app = toPublicApp(remyApp, locale)
      expect(app.name).toBe('Rémy')
      expect(app.onboarding.intro).toBeTruthy()
      for (const q of app.onboarding.questions) {
        expect(typeof q.label).toBe('string')
        if (q.type === 'choice') for (const o of q.options) expect(typeof o.label).toBe('string')
      }
      expect(app.panels.map((p) => p.label)).toEqual([MESSAGES[locale].panels.fiche, MESSAGES[locale].panels.comparatif, MESSAGES[locale].panels.help])
    }
    expect(remyApp.locales).toEqual([...SUPPORTED_LOCALES])
  })

  it('un texte simple vaut pour toutes les langues, un objet retombe sur l’anglais', () => {
    expect(pick('Teinty', 'de')).toBe('Teinty')
    expect(pick({ en: 'Hello', fr: 'Salut' }, 'fr')).toBe('Salut')
    expect(pick({ en: 'Hello', fr: 'Salut' }, 'it')).toBe('Hello')
    const q = resolveQuestion({ type: 'choice', key: 'k', label: { en: 'Pick', es: 'Elige' }, options: [{ value: 'a', label: 'A' }], required: true }, 'es')
    expect(q.label).toBe('Elige')
  })

  it('le prompt système impose la langue de la personne et le titre provisoire la suit', () => {
    const prompt = buildSystemPrompt({ app: remyApp, locale: 'it', profile: { firstName: 'Luca' }, notes: [], toolNames: [], plan: 'free' })
    expect(prompt).toContain('italien')
    expect(prompt).toContain('Come ti chiamo?')
    expect(buildSystemPrompt({ app: remyApp, locale: 'xx', profile: {}, notes: [], toolNames: [], plan: 'free' })).toContain('anglais')
    expect(defaultTitle('de')).toBe('Neue Unterhaltung')
    expect(defaultTitle('zz')).toBe('New conversation')
  })
})

describe('I18nProvider', () => {
  it('fournit le dictionnaire de la langue demandée', () => {
    function Probe() {
      const { t, f } = useI18n()
      return <p>{f(t.chat.greeting, { name: 'Ana' })}</p>
    }
    render(
      <I18nProvider locale="es">
        <Probe />
      </I18nProvider>
    )
    expect(screen.getByText('Hola Ana.')).toBeTruthy()
  })
})
