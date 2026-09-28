'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_PAYOUT_EUR } from '@/core/growth/affiliates'
import { L } from '@/lib/admin/labels'

/** Ajout d'un créateur affilié : code, nom, contact, commission. Le lien se déduit du code. */
export function AffiliateForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [payout, setPayout] = useState(String(DEFAULT_PAYOUT_EUR))
  const [mode, setMode] = useState<'fixed' | 'percent'>('fixed')
  const [percent, setPercent] = useState('30')
  const [months, setMonths] = useState('12')
  const [appSlug, setAppSlug] = useState('')

  async function submit(): Promise<void> {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toLowerCase(),
          name: name.trim(),
          contact: contact.trim() || undefined,
          payoutEur: mode === 'fixed' ? Number(payout) : 0,
          percent: mode === 'percent' ? Number(percent) : null,
          months: mode === 'percent' && months.trim() ? Number(months) : null,
          appSlug: appSlug.trim() || null,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setMessage({ ok: false, text: `${L.settings.failed}${b?.error?.message ?? res.status}` })
        return
      }
      setMessage({ ok: true, text: L.affiliates.created })
      setCode('')
      setName('')
      setContact('')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const valid =
    /^[a-z0-9][a-z0-9-]{1,31}$/.test(code.trim().toLowerCase()) &&
    name.trim().length > 0 &&
    (mode === 'fixed' ? Number(payout) >= 0 : Number(percent) >= 0 && Number(percent) <= 100 && (!months.trim() || Number(months) >= 1))
  const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

  return (
    <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
      <p className="mb-1 font-semibold">{L.affiliates.addTitle}</p>
      <p className="mb-3 text-xs text-muted-foreground">{L.affiliates.addIntro}</p>
      {message ? (
        <p role="status" className={`mb-3 text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.affiliates.code}
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="lea" className="h-9 w-36 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.affiliates.name}
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Léa" className="h-9 w-44 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.affiliates.contact}
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="@lea.tdah" className="h-9 w-48 text-sm" />
        </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {L.affiliates.appSlug}
        <Input value={appSlug} onChange={(e) => setAppSlug(e.target.value.toLowerCase())} placeholder="amorce" className="h-9 font-mono" />
      </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.affiliates.mode}
          <select value={mode} onChange={(e) => setMode(e.target.value as 'fixed' | 'percent')} className={select}>
            <option value="fixed">{L.affiliates.modeFixed}</option>
            <option value="percent">{L.affiliates.modePercent}</option>
          </select>
        </label>
        {mode === 'fixed' ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {L.affiliates.payout}
            <Input type="number" min={0} max={100} step={0.5} value={payout} onChange={(e) => setPayout(e.target.value)} className="h-9 w-24 text-right text-sm" />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {L.affiliates.percent}
              <Input type="number" min={0} max={100} step={1} value={percent} onChange={(e) => setPercent(e.target.value)} className="h-9 w-20 text-right text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {L.affiliates.months}
              <Input type="number" min={1} max={120} step={1} value={months} onChange={(e) => setMonths(e.target.value)} className="h-9 w-28 text-right text-sm" />
            </label>
          </>
        )}
        <Button size="sm" className="rounded-full" disabled={pending || !valid} onClick={() => void submit()}>
          {L.affiliates.add}
        </Button>
      </div>
    </div>
  )
}
