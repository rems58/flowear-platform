'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LifeBuoy, X } from 'lucide-react'
import { CONTACT_CATEGORIES } from '@/core/reports/schema'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n/provider'
import { CategoryChips } from './report-chips'
import { useReport } from './use-report'

type Category = (typeof CONTACT_CATEGORIES)[number]

/**
 * « Un problème ? » : le formulaire libre du menu. Bug, paiement, question. Il ne vise
 * aucun message : c'est la personne qui parle de son expérience, pas d'une réponse.
 *
 * Boîte de dialogue modale, fermée par la croix, par Échap ou en cliquant à côté. Rendue
 * dans `document.body` : le menu mobile est un tiroir qui défile, un `fixed` dedans y reste pris.
 */
export function ContactForm({ appSlug }: { appSlug: string }) {
  const { t } = useI18n()
  const { state, send, reset } = useReport(appSlug)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<Category | null>(null)
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    // Envoyé : on repart propre à la prochaine ouverture.
    if (state === 'sent') {
      reset()
      setCategory(null)
      setBody('')
    }
  }

  const ready = Boolean(category) && body.trim().length >= 3 && state !== 'sending'

  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="justify-start rounded-xl" onClick={() => setOpen(true)}>
        <LifeBuoy data-icon="inline-start" />
        {t.report.contactAction}
      </Button>
      {open
        ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={t.report.contactTitle}>
          <button type="button" className="absolute inset-0 bg-black/40" onClick={close} aria-label={t.common.close} />
          <div className="relative flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">{t.report.contactTitle}</p>
              <Button variant="ghost" size="icon" className="-mr-2 rounded-full" onClick={close} aria-label={t.common.close}>
                <X />
              </Button>
            </div>
            {state === 'sent' ? (
              <p className="text-sm text-muted-foreground">{t.report.sent}</p>
            ) : (
              <>
                <CategoryChips options={CONTACT_CATEGORIES} value={category} onChange={setCategory} labels={t.report} label={t.report.contactTitle} />
                <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} placeholder={t.report.contactPlaceholder} rows={4} maxLength={2000} className="text-sm" />
                {state === 'failed' ? (
                  <p role="alert" className="text-xs text-destructive">
                    {t.report.failed}
                  </p>
                ) : null}
                <Button type="button" className="rounded-full" disabled={!ready} onClick={() => category && send({ kind: 'contact', category, body: body.trim() })}>
                  {t.report.contactSend}
                </Button>
              </>
            )}
          </div>
        </div>,
        document.body
      )
        : null}
    </>
  )
}
