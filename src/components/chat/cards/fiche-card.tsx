'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/provider'

export interface FicheCardData {
  title: string
  goal: string
  steps: { title: string; detail: string }[]
  tips?: string[]
}

/** Carte fiche méthode : objectif, étapes numérotées, conseils. */
export function FicheCard({ data }: { data: FicheCardData }) {
  const { t } = useI18n()
  return (
    <Card className="border-border">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.cards.fiche}</p>
        <CardTitle className="text-lg">{data.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{data.goal}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3">
          {data.steps?.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        {data.tips?.length ? (
          <div className="rounded-xl bg-muted p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.cards.tips}</p>
            <ul className="list-disc space-y-1 pl-4 text-sm">
              {data.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
