import type { AppDefinition } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'
import { getMessages } from '@/lib/i18n/messages'

/** Une ligne de la page mémoire : un libellé lisible, une valeur, et les clés qu'elle recouvre. */
export interface ProfileRow {
  keys: string[]
  label: string
  value: string
}

function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function show(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Le profil tel que la personne le lit : réponses d'onboarding avec leur question, puis ce que
 * l'IA a appris. Un questionnaire tient sur une ligne (score, niveau, zone, date) au lieu de
 * quatre clés brutes ; les clés en `_` sont de la mécanique et n'apparaissent pas ; toute
 * autre clé prend le libellé du manifeste ou, à défaut, sa forme humanisée.
 */
export function profileRows(app: AppDefinition, profile: Record<string, unknown>, locale: Locale): { onboarding: ProfileRow[]; learned: ProfileRow[] } {
  const t = getMessages(locale)
  const onboardingLabels = new Map(app.onboarding.questions.map((q) => [q.key, pick(q.label, locale)]))
  const optionLabels = new Map(app.onboarding.questions.filter((q) => q.type === 'choice').map((q) => [q.key, new Map(q.options.map((o) => [o.value, pick(o.label, locale)]))]))
  const onboarding: ProfileRow[] = []
  const learned: ProfileRow[] = []
  const taken = new Set<string>()

  for (const def of app.assessments) {
    const k = def.profileKey
    const percent = profile[`${k}_percent`]
    if (typeof percent !== 'number') continue
    const levelId = profile[`${k}_level`]
    const level = def.levels.find((l) => l.id === levelId)
    const date = profile[`${k}_date`]
    const keys = [`${k}_percent`, `${k}_level`, `${k}_zone`, `${k}_date`].filter((key) => key in profile)
    keys.forEach((key) => taken.add(key))
    const parts = [`${Math.round(percent)} %`]
    if (level) parts.push(pick(level.label, locale))
    if (typeof profile[`${k}_zone`] === 'string') parts.push(String(profile[`${k}_zone`]))
    if (typeof date === 'string') parts.push(new Date(date).toLocaleDateString(locale))
    learned.push({ keys, label: pick(def.name, locale), value: parts.join(' · ') })
  }

  const generic = t.memory.keys as Record<string, string>
  for (const [key, value] of Object.entries(profile)) {
    if (key.startsWith('_') || taken.has(key) || value === undefined || value === null || value === '') continue
    if (onboardingLabels.has(key)) {
      onboarding.push({ keys: [key], label: onboardingLabels.get(key)!, value: optionLabels.get(key)?.get(String(value)) ?? show(value) })
      continue
    }
    const manifest = app.profileLabels[key]
    const label = manifest ? pick(manifest, locale) : (generic[key] ?? humanize(key))
    learned.push({ keys: [key], label, value: show(value) })
  }
  return { onboarding, learned }
}
