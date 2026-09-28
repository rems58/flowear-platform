import { describe, expect, it } from 'vitest'
import { amorceApp } from '@/apps/amorce/manifest'
import { AMORCE_TOOLS } from '@/apps/amorce/tools'
import { remyApp } from '@/apps/remy/manifest'
import { buildGuide, undocumentedTools } from '@/core/help/guide'
import { SUPPORTED_LOCALES } from '@/core/i18n/locale'
import { addToolProvider, resetTools } from '@/core/tools'
import { getMessages } from '@/lib/i18n/messages'
import { toPublicApp } from '@/lib/public-app'

describe('guide : tout ce que la personne peut faire', () => {
  it('chaque outil de chaque IA a sa description, dans les cinq langues', () => {
    resetTools()
    addToolProvider(() => AMORCE_TOOLS)
    expect(undocumentedTools(amorceApp)).toEqual([])
    expect(undocumentedTools(remyApp)).toEqual([])
    const keys = Object.keys(getMessages('en').help.tools)
    for (const locale of SUPPORTED_LOCALES) expect(Object.keys(getMessages(locale).help.tools)).toEqual(keys)
  })

  it('se déduit du manifeste : outils dans l ordre, questionnaires nommés, helpline sans le déclarer, et un exemple à toucher', () => {
    resetTools()
    addToolProvider(() => AMORCE_TOOLS)
    const g = buildGuide(amorceApp, 'fr')
    expect(g.intro).toBe('Tout ce que Amorce sait faire. Appuie sur un exemple pour l’essayer.')
    expect(g.say.slice(0, 3).map((e) => e.key)).toEqual(['brain_dump', 'next_action', 'break_down'])
    expect(g.say.find((e) => e.key === 'assessment:asrs')).toMatchObject({ title: 'Dépistage TDAH (ASRS, OMS)', example: 'Faire le test' })
    expect(g.auto.map((e) => e.key)).toContain('helpline')
    expect(g.always.map((e) => e.key)).toEqual(['memory', 'suggestions', 'voice', 'push', 'feedback', 'languages'])
    // Rémy n'a pas de tâches : pas de vidage dans son guide, mais les fiches oui.
    const r = buildGuide(remyApp, 'en')
    expect(r.say.map((e) => e.key)).not.toContain('brain_dump')
    expect(r.say.map((e) => e.key)).toContain('create_fiche')
  })

  it('le panneau Guide est dans les outils de toute IA', () => {
    resetTools()
    addToolProvider(() => AMORCE_TOOLS)
    expect(toPublicApp(remyApp, 'de').panels.map((p) => p.type)).toContain('help')
    expect(toPublicApp(amorceApp, 'fr').panels.at(-1)).toEqual({ type: 'help', label: 'Guide' })
  })
})
