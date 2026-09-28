'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, RotateCcw } from 'lucide-react'
import { useChatActions } from '@/components/chat/chat-actions'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'

export interface AssessmentCardData {
  kind: 'result'
  assessmentId: string
  name: string
  percent: number
  zone: number
  total: number
  levelId: string
  level: string
  text: string
  disclaimer: string
  date: string
  retakeAfter: string | null
  /** Refaire est ouvert (plan) ; faux = c'est en Pro. */
  canRetake?: boolean
}

const LEVEL_TONE: Record<string, string> = {
  low: 'text-emerald-600 dark:text-emerald-400',
  moderate: 'text-amber-600 dark:text-amber-400',
  high: 'text-orange-600 dark:text-orange-400',
}

/**
 * Résultat d'un questionnaire : pourcentage, niveau, réponses dans la zone, texte du manifeste,
 * et la réserve (dépistage, pas diagnostic) toujours visible. Rien ici n'est écrit par le modèle.
 * « Refaire le test » repart de la première question ; le nouveau résultat remplace l'ancien.
 */
export function AssessmentCard({ data, active }: { data: AssessmentCardData; active: boolean }) {
  const { locale, t, f } = useI18n()
  const actions = useChatActions()
  const [sent, setSent] = useState(false)
  const canRestart = active && !sent && actions !== null && !actions.busy
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f(t.assessment.result, { name: data.name })}</p>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{data.percent} %</span>
        <span className={`text-sm font-medium ${LEVEL_TONE[data.levelId] ?? ''}`}>{data.level}</span>
      </div>
      <p className="text-sm">{data.text}</p>
      <p className="text-xs text-muted-foreground">{f(t.assessment.zone, { zone: data.zone, total: data.total })}</p>
      <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{data.disclaimer}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{new Date(data.date).toLocaleDateString(locale)}</p>
        {active && data.canRetake === false ? (
          <Button render={<Link href={`/pricing?app=${actions?.appSlug ?? ''}`} />} nativeButton={false} size="sm" variant="outline" className="rounded-full">
            <Lock data-icon="inline-start" />
            {t.assessment.restartPro}
          </Button>
        ) : active ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={!canRestart}
            onClick={() => {
              if (!actions) return
              setSent(true)
              actions.send(f(t.assessment.restartPrompt, { name: data.name }))
            }}
          >
            <RotateCcw data-icon="inline-start" />
            {t.assessment.restart}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
