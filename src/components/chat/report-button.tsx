'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { MESSAGE_CATEGORIES } from '@/core/reports/schema'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n/provider'
import { CategoryChips } from './report-chips'
import { useReport } from './use-report'

type Category = (typeof MESSAGE_CATEGORIES)[number]

/**
 * « Signaler » sous une réponse. Distinct du pouce bas : celui-ci dit « pas utile », le
 * signalement dit « pas acceptable » et réclame quelqu'un. Un petit formulaire se déplie
 * sur place, une seule fois : envoyé, il laisse un remerciement et ne revient pas.
 */
export function ReportButton({ appSlug, messageId }: { appSlug: string; messageId: string }) {
  const { t } = useI18n()
  const { state, send } = useReport(appSlug)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category | null>(null)
  const [body, setBody] = useState('')

  if (state === 'sent') return <p className="text-xs text-muted-foreground">{t.report.sent}</p>

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Flag data-icon="inline-start" />
        {t.report.action}
      </Button>
    )
  }

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-2xl border border-black/[0.08] bg-card p-3 text-sm dark:border-white/[0.1]">
      <p className="font-semibold">{t.report.title}</p>
      <p className="text-xs text-muted-foreground">{t.report.hint}</p>
      <CategoryChips options={MESSAGE_CATEGORIES} value={category} onChange={setCategory} labels={t.report} label={t.report.title} />
      <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} placeholder={t.report.placeholder} rows={2} maxLength={2000} className="text-sm" />
      {state === 'failed' ? (
        <p role="alert" className="text-xs text-destructive">
          {t.report.failed}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="rounded-full" disabled={!category || state === 'sending'} onClick={() => category && send({ kind: 'message', messageId, category, body: body.trim() || undefined })}>
          {t.report.send}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </div>
  )
}
