import type { AssessmentDefinition } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'

/** Progression en cours, rangée dans le profil sous `_assess_<id>`. */
export interface AssessmentProgress {
  answers: Record<string, string>
  startedAt: string
}

export interface AssessmentQuestionView {
  kind: 'question'
  assessmentId: string
  name: string
  intro: string | null
  index: number
  total: number
  question: string
  key: string
  options: { value: string; label: string }[]
}

export interface AssessmentResultView {
  kind: 'result'
  assessmentId: string
  name: string
  score: number
  max: number
  percent: number
  zone: number
  total: number
  levelId: string
  level: string
  text: string
  disclaimer: string
  date: string
  /** Peut être refait à partir de cette date (null = tout de suite). */
  retakeAfter: string | null
}

export const PROGRESS_PREFIX = '_assess_'

export function progressKey(id: string): string {
  return `${PROGRESS_PREFIX}${id}`
}

export function readProgress(profile: Record<string, unknown>, id: string): AssessmentProgress | null {
  const raw = profile[progressKey(id)]
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<AssessmentProgress>
  if (!p.answers || typeof p.answers !== 'object') return null
  return { answers: { ...(p.answers as Record<string, string>) }, startedAt: typeof p.startedAt === 'string' ? p.startedAt : new Date(0).toISOString() }
}

/** Première question sans réponse valide, ou null si tout est répondu. */
export function nextQuestion(def: AssessmentDefinition, answers: Record<string, string>, locale: Locale): AssessmentQuestionView | null {
  const index = def.questions.findIndex((q) => !q.options.some((o) => o.value === answers[q.key]))
  if (index < 0) return null
  const q = def.questions[index]
  return {
    kind: 'question',
    assessmentId: def.id,
    name: pick(def.name, locale),
    intro: index === 0 ? pick(def.intro, locale) : null,
    index: index + 1,
    total: def.questions.length,
    question: pick(q.label, locale),
    key: q.key,
    options: q.options.map((o) => ({ value: o.value, label: pick(o.label, locale) })),
  }
}

export interface AssessmentScore {
  score: number
  max: number
  percent: number
  zone: number
  levelId: string
}

export function scoreAssessment(def: AssessmentDefinition, answers: Record<string, string>): AssessmentScore {
  let score = 0
  let max = 0
  let zone = 0
  for (const q of def.questions) {
    const chosen = q.options.find((o) => o.value === answers[q.key])
    max += Math.max(...q.options.map((o) => o.score))
    if (!chosen) continue
    score += chosen.score
    if (chosen.zone) zone++
  }
  const levels = [...def.levels].sort((a, b) => a.min - b.min)
  let levelId = levels[0].id
  for (const l of levels) if (zone >= l.min) levelId = l.id
  return { score, max, percent: max > 0 ? Math.round((score / max) * 100) : 0, zone, levelId }
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`))
}

export function resultView(def: AssessmentDefinition, s: AssessmentScore, date: string, locale: Locale): AssessmentResultView {
  const level = pick(def.levels.find((l) => l.id === s.levelId)?.label ?? def.levels[0].label, locale)
  const retakeAfter = def.cooldownDays > 0 ? new Date(new Date(date).getTime() + def.cooldownDays * 86_400_000).toISOString() : null
  return {
    kind: 'result',
    assessmentId: def.id,
    name: pick(def.name, locale),
    score: s.score,
    max: s.max,
    percent: s.percent,
    zone: s.zone,
    total: def.questions.length,
    levelId: s.levelId,
    level,
    text: fill(pick(def.result, locale), { percent: s.percent, level, zone: s.zone, total: def.questions.length }),
    disclaimer: pick(def.disclaimer, locale),
    date,
    retakeAfter,
  }
}

/** Ce que le résultat écrit dans le profil : lisible par le prompt, réutilisable par la persona. */
export function resultProfilePatch(def: AssessmentDefinition, s: AssessmentScore, date: string): Record<string, unknown> {
  const k = def.profileKey
  return { [`${k}_percent`]: s.percent, [`${k}_level`]: s.levelId, [`${k}_zone`]: `${s.zone}/${def.questions.length}`, [`${k}_date`]: date.slice(0, 10) }
}

/** Résultat précédent, s'il est encore dans le délai de reprise. */
export function previousResult(def: AssessmentDefinition, profile: Record<string, unknown>, now: Date): { date: string; blocked: boolean } | null {
  const date = profile[`${def.profileKey}_date`]
  if (typeof date !== 'string') return null
  const at = new Date(date).getTime()
  if (Number.isNaN(at)) return null
  return { date, blocked: def.cooldownDays > 0 && now.getTime() - at < def.cooldownDays * 86_400_000 }
}

/**
 * Questionnaire en cours dont la question pendante a pour option le texte que la personne
 * vient d'envoyer (un clic sur un bouton) : l'appel de l'outil doit être forcé, le modèle
 * ne doit pas pouvoir conclure lui-même.
 */
export function pendingAssessmentFor(defs: readonly AssessmentDefinition[], profile: Record<string, unknown>, userText: string): string | null {
  const text = userText.trim().toLowerCase()
  if (!text) return null
  for (const def of defs) {
    if (!readProgress(profile, def.id)) continue
    // La réponse vient d'être enregistrée par la route avant l'envoi du message : on cherche
    // le texte parmi les options de n'importe quelle question du questionnaire en cours.
    for (const q of def.questions) {
      for (const o of q.options) {
        const labels = typeof o.label === 'string' ? [o.label] : Object.values(o.label)
        if (labels.some((l) => typeof l === 'string' && l.trim().toLowerCase() === text)) return def.id
      }
    }
  }
  return null
}
