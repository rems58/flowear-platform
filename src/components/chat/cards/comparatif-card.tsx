'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/provider'

export interface ComparatifCardData {
  title: string
  criteria: string[]
  items: { name: string; scores: Record<string, string>; verdict?: string }[]
  recommendation: string
}

/** Carte comparatif : tableau critères × options, verdicts, recommandation. */
export function ComparatifCard({ data }: { data: ComparatifCardData }) {
  const { t } = useI18n()
  return (
    <Card className="border-border">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.cards.comparatif}</p>
        <CardTitle className="text-lg">{data.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground">{t.cards.criterion}</th>
                {data.items?.map((item) => (
                  <th key={item.name} className="py-2 pr-3 font-semibold">
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.criteria?.map((criterion) => (
                <tr key={criterion} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 text-muted-foreground">{criterion}</td>
                  {data.items?.map((item) => (
                    <td key={item.name} className="py-2 pr-3">
                      {item.scores?.[criterion] ?? '·'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.items?.some((i) => i.verdict) ? (
          <ul className="flex flex-col gap-1 text-sm">
            {data.items.map((item) =>
              item.verdict ? (
                <li key={item.name}>
                  <span className="font-medium">{item.name} :</span> {item.verdict}
                </li>
              ) : null
            )}
          </ul>
        ) : null}
        <div className="rounded-xl bg-muted p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.cards.forYou}</p>
          <p className="text-sm">{data.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  )
}
