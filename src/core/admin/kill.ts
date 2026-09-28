import type { AppDefinition } from '@/apps/types'

/**
 * Verdict kill ou keep d'une IA, calculé depuis les critères de son manifeste.
 *
 * Le manifeste dit ce qu'on attend (rétention J7 minimale, inscriptions par lot de
 * carrousels, délai de revue). Ici on compare à ce qui s'est passé, et on tranche à la
 * place de personne : la décision reste à Rémy, mais elle est posée devant lui au lieu
 * d'être repoussée.
 */
export interface KillMetrics {
  /** Personnes des cohortes assez anciennes pour que J7 ait un sens. */
  eligible: number
  /** Parmi elles, celles revenues entre J7 et J14. */
  retainedD7: number
  /** Inscriptions sur l'IA depuis son lancement. */
  signups: number
  /** Date du premier onboarding terminé, `null` si personne. */
  launchedAt: Date | null
}

export type KillColor = 'green' | 'orange' | 'red' | 'grey'

export interface KillVerdict {
  color: KillColor
  /** Rétention J7 mesurée, `null` tant qu'aucune cohorte n'est assez ancienne. */
  retentionD7: number | null
  targetD7: number
  signups: number
  targetSignups: number
  /** Date à laquelle la revue est due, `null` sans lancement. */
  reviewDueAt: Date | null
  reviewDue: boolean
  /** Explication en une phrase, pour la carte. */
  reason: string
}

const DAY_MS = 86_400_000

export function killVerdict(app: AppDefinition, metrics: KillMetrics, now: Date): KillVerdict {
  const kill = app.kill
  const retentionD7 = metrics.eligible > 0 ? metrics.retainedD7 / metrics.eligible : null
  const reviewDueAt = kill && metrics.launchedAt ? new Date(metrics.launchedAt.getTime() + kill.reviewAfterWeeks * 7 * DAY_MS) : null
  const reviewDue = reviewDueAt !== null && reviewDueAt.getTime() <= now.getTime()

  if (!kill) {
    return { color: 'grey', retentionD7, targetD7: 0, signups: metrics.signups, targetSignups: 0, reviewDueAt, reviewDue, reason: 'Aucun critère dans le manifeste.' }
  }
  if (retentionD7 === null) {
    return {
      color: 'grey',
      retentionD7,
      targetD7: kill.d7RetentionMin,
      signups: metrics.signups,
      targetSignups: kill.signupsPer10CarouselsMin,
      reviewDueAt,
      reviewDue,
      reason: 'Trop tôt : aucune cohorte n’a encore quatorze jours.',
    }
  }
  // Vert : la rétention tient. Orange : en dessous mais la revue n'est pas encore due,
  // il reste du temps. Rouge : en dessous et la date de revue est passée.
  const holds = retentionD7 >= kill.d7RetentionMin
  const color: KillColor = holds ? 'green' : reviewDue ? 'red' : 'orange'
  const pct = Math.round(retentionD7 * 100)
  const target = Math.round(kill.d7RetentionMin * 100)
  const reason = holds
    ? `Rétention J7 à ${pct} %, objectif ${target} %. Ça tient.`
    : reviewDue
      ? `Rétention J7 à ${pct} % pour ${target} % attendus, et la revue est due. À trancher.`
      : `Rétention J7 à ${pct} % pour ${target} % attendus. Revue prévue, il reste du temps.`
  return { color, retentionD7, targetD7: kill.d7RetentionMin, signups: metrics.signups, targetSignups: kill.signupsPer10CarouselsMin, reviewDueAt, reviewDue, reason }
}
