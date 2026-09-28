'use client'

import { HeartHandshake, Phone } from 'lucide-react'
import { useI18n } from '@/lib/i18n/provider'

export interface HelplineCardData {
  country: string
  lines: { name: string; number: string; hours?: string }[]
  emergency: string
  directory: string
}

/**
 * Carte d'aide : le numéro du pays de la personne, en grand, appelable d'un geste. Tout ce qui
 * est ici vient du code (`src/core/safety/helplines.ts`), jamais du modèle.
 */
export function HelplineCard({ data }: { data: HelplineCardData }) {
  const { t, f } = useI18n()
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
      <p className="inline-flex items-center gap-2 text-sm font-semibold">
        <HeartHandshake className="size-4 text-rose-500" aria-hidden />
        {t.helpline.title}
      </p>
      <p className="text-sm">{t.helpline.intro}</p>
      {data.lines.length ? (
        <ul className="flex flex-col gap-2">
          {data.lines.map((line) => (
            <li key={line.number}>
              <a
                href={`tel:${line.number.replace(/[^0-9+*#]/g, '')}`}
                className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-card px-3 py-3 transition-colors hover:border-rose-500/40 dark:border-white/[0.1]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white" aria-hidden>
                  <Phone className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-2xl font-semibold tabular-nums tracking-tight">{line.number}</span>
                  <span className="block text-xs text-muted-foreground">
                    {line.name}
                    {line.hours ? ` · ${line.hours}` : ''}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {f(t.helpline.emergency, { number: data.emergency })}{' '}
        <a href={data.directory} target="_blank" rel="noopener noreferrer" className="underline">
          {t.helpline.directory}
        </a>
      </p>
    </div>
  )
}
