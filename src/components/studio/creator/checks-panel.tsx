'use client'

import { Check, X } from 'lucide-react'
import type { CheckResult } from '@/core/studio/checks'
import { useI18n } from '@/lib/i18n/provider'

/** La liste des règles, verte ou rouge, avec le motif en clair quand une règle échoue. */
export function ChecksPanel({ results, intro = true }: { results: CheckResult[]; intro?: boolean }) {
  const { t } = useI18n()
  const labels = t.creator as unknown as Record<string, string>
  const failing = results.filter((r) => !r.ok)
  return (
    <div className="flex flex-col gap-3">
      {intro ? <p className="text-sm text-muted-foreground">{t.creator.checksIntro}</p> : null}
      {failing.length === 0 ? <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{t.creator.checksOk}</p> : null}
      <ul className="flex flex-col gap-1.5">
        {results.map((r) => (
          <li key={r.check} className="flex items-start gap-2 text-sm">
            {r.ok ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="ok" /> : <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="ko" />}
            <span>
              <span className={r.ok ? '' : 'font-medium'}>{labels[`c_${r.check}`] ?? r.check}</span>
              {!r.ok && r.detail ? <span className="block text-xs text-muted-foreground">{r.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
