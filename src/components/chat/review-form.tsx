'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/lib/i18n/provider'
import { useReport } from './use-report'

/**
 * « Donner ton avis » : tout en bas du menu, avant le logo Flowear. Une note sur cinq et,
 * si la personne veut, quelques mots, en bien comme en mal. Rangé avec les signalements
 * (même route, même boîte admin) sous la source `review`, pour que rien ne se perde.
 *
 * Boîte de dialogue modale, fermée par la croix, par Échap ou en cliquant à côté. Rendue
 * dans `document.body` : le menu mobile est un tiroir qui défile, un `fixed` dedans y reste pris.
 */
export function ReviewForm({ appSlug, appName }: { appSlug: string; appName: string }) {
  const { t, f } = useI18n()
  const { state, send, reset } = useReport(appSlug)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
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
    if (state === 'sent') {
      reset()
      setRating(0)
      setBody('')
    }
  }

  const shown = hover || rating
  const ready = rating > 0 && state !== 'sending'

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={f(t.review.title, { name: appName })}>
      <button type="button" className="absolute inset-0 bg-black/40" onClick={close} aria-label={t.common.close} />
      <div className="relative flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">{f(t.review.title, { name: appName })}</p>
          <Button variant="ghost" size="icon" className="-mr-2 rounded-full" onClick={close} aria-label={t.common.close}>
            <X />
          </Button>
        </div>
        {state === 'sent' ? (
          <p className="text-sm text-muted-foreground">{t.review.sent}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t.review.hint}</p>
            <div className="flex items-center gap-1" role="radiogroup" aria-label={t.review.action} onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={f(t.review.star, { n })}
                  className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRating(n)}
                >
                  <Star className={`size-8 transition-colors ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
                </button>
              ))}
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} placeholder={t.review.placeholder} rows={4} maxLength={2000} className="text-sm" />
            {state === 'failed' ? (
              <p role="alert" className="text-xs text-destructive">
                {t.review.failed}
              </p>
            ) : null}
            <Button type="button" className="rounded-full" disabled={!ready} onClick={() => send({ kind: 'review', rating, body: body.trim() || undefined })}>
              {t.review.send}
            </Button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="justify-start rounded-xl" onClick={() => setOpen(true)}>
        <Star data-icon="inline-start" />
        {t.review.action}
      </Button>
      {open ? createPortal(dialog, document.body) : null}
    </>
  )
}
