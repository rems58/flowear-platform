import type { AppDefinition } from '@/apps/types'
import { pick, type Locale } from '@/core/i18n/locale'

/** Faits mesurés sur la personne, à partir desquels les statuts du manifeste s'évaluent. */
export interface StatusFacts {
  onboardingDone: boolean
  activeDays: number
  artifacts: number
}

/** Statuts atteints (récompense d'ego, Eyal) : libellés résolus dans la langue de la personne. */
export function computeStatuses(app: AppDefinition, facts: StatusFacts, locale: Locale): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const s of app.statuses) {
    const ok =
      s.rule.type === 'onboarding_done' ? facts.onboardingDone : s.rule.type === 'active_days' ? facts.activeDays >= s.rule.days : facts.artifacts >= s.rule.count
    if (ok) out.push({ id: s.id, label: pick(s.label, locale) })
  }
  return out
}
