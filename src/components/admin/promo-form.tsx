'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { L } from '@/lib/admin/labels'

interface PromoFormProps {
  /** Fenêtre en cours (réglage `offers.promo`, portée toutes les IA), sinon null. */
  promo: { from: string; until: string } | null
  /** Heures de l'offre de bienvenue en vigueur. */
  welcomeHours: number
}

/** Date locale « YYYY-MM-DDTHH:mm » pour un champ datetime-local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Fenêtre promo et offre de bienvenue, réglées à chaud. Une fenêtre est un réglage
 * `offers.promo` posé pour toutes les IA ; la fermer, c'est retirer le réglage.
 */
export function PromoForm({ promo, welcomeHours }: PromoFormProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [from, setFrom] = useState(promo ? toLocalInput(promo.from) : '')
  const [until, setUntil] = useState(promo ? toLocalInput(promo.until) : '')
  const [hours, setHours] = useState(String(welcomeHours))

  async function call(method: 'PUT' | 'DELETE', body: unknown): Promise<void> {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/settings', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setMessage({ ok: false, text: `${L.settings.failed}${b?.error?.message ?? res.status}` })
        return
      }
      setMessage({ ok: true, text: L.settings.saved })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const valid = from && until && new Date(from).getTime() < new Date(until).getTime()

  return (
    <div className="flex flex-col gap-5">
      {message ? (
        <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      ) : null}
      <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
        <p className="mb-1 font-semibold">{L.settings.promoTitle}</p>
        <p className="mb-3 text-xs text-muted-foreground">{L.settings.promoIntro}</p>
        <p className="mb-3 text-sm">{promo ? `${L.settings.promoActive} ${new Date(promo.until).toLocaleString('fr-FR')}` : L.settings.promoNone}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {L.settings.promoFrom}
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {L.settings.promoUntil}
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 text-sm" />
          </label>
          <Button size="sm" className="rounded-full" disabled={pending || !valid} onClick={() => call('PUT', { scope: 'all', key: 'offers.promo', value: { from: new Date(from).toISOString(), until: new Date(until).toISOString() } })}>
            {L.settings.promoOpen}
          </Button>
          {promo ? (
            <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => call('DELETE', { scope: 'all', key: 'offers.promo' })}>
              {L.settings.promoClose}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
        <p className="mb-3 font-semibold">{L.settings.welcomeTitle}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex-1 text-muted-foreground">{L.settings.welcomeHours}</span>
          <Input type="number" min={0} max={720} step={1} value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-24 text-right text-sm" aria-label={L.settings.welcomeHours} />
          <Button size="xs" variant="outline" className="rounded-full" disabled={pending || Number(hours) === welcomeHours} onClick={() => call('PUT', { scope: 'all', key: 'offers.welcome.hours', value: Number(hours) })}>
            {L.settings.save}
          </Button>
        </div>
      </div>
    </div>
  )
}
