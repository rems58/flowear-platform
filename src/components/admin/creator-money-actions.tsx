'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { L, fmt } from '@/lib/admin/labels'

/**
 * Le lien de statistiques (créer, régénérer, révoquer) et l'enregistrement d'un versement.
 * Le lien complet n'existe qu'ici, juste après sa création : la base n'en garde que l'empreinte.
 */
export function CreatorMoneyActions({ slug, shareLinkAt }: { slug: string; shareLinkAt: string | null }) {
  const router = useRouter()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function call(path: string, body: unknown): Promise<{ ok: boolean; data?: { url?: string } }> {
    setPending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/creators/${encodeURIComponent(slug)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json().catch(() => null)) as { data?: { url?: string }; error?: { message?: string } } | null
      if (!res.ok) {
        setMessage({ ok: false, text: `${L.actions.failed}${json?.error?.message ?? res.status}` })
        return { ok: false }
      }
      setMessage({ ok: true, text: L.actions.done })
      router.refresh()
      return { ok: true, data: json?.data }
    } finally {
      setPending(false)
    }
  }

  async function share(action: 'create' | 'revoke') {
    const out = await call('share', { action })
    setCopied(false)
    setUrl(action === 'create' && out.data?.url ? out.data.url : null)
  }

  async function payout() {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100)
    const out = await call('payouts', { amountCents: cents, paidAt: date, note: note.trim() || null })
    if (out.ok) {
      setAmount('')
      setNote('')
    }
  }

  const box = 'flex flex-col gap-3 rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08]'
  const cents = Math.round(Number(amount.replace(',', '.')) * 100)

  return (
    <div className="flex flex-col gap-4">
      {message ? <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>{message.text}</p> : null}
      <div className={box}>
        <p className="font-medium">{L.creators.link}</p>
        <p className="text-xs text-muted-foreground">{L.creators.linkIntro}</p>
        <p className="text-xs">{shareLinkAt ? `${L.creators.linkActive} ${fmt.dateTime(shareLinkAt)}` : L.creators.linkNone}</p>
        {url ? (
          <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3">
            <code className="break-all text-xs">{url}</code>
            <Button size="sm" variant="outline" className="self-start rounded-full" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}>
              {copied ? L.creators.linkCopied : L.creators.linkCopy}
            </Button>
            <p className="text-xs text-muted-foreground">{L.creators.linkShown}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full text-white hover:opacity-90" style={{ background: '#5E5CE6' }} disabled={pending} onClick={() => void share('create')}>
            {shareLinkAt ? L.creators.linkRegenerate : L.creators.linkCreate}
          </Button>
          {shareLinkAt ? (
            <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => void share('revoke')}>
              {L.creators.linkRevoke}
            </Button>
          ) : null}
        </div>
      </div>
      <div className={box}>
        <p className="font-medium">{L.creators.payoutAdd}</p>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.creators.payoutAmount}
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="42,50" className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.creators.payoutDate}
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {L.creators.payoutNote}
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className="h-9" />
        </label>
        <Button size="sm" className="self-start rounded-full" disabled={pending || !(cents > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => void payout()}>
          {L.creators.payoutSave}
        </Button>
      </div>
    </div>
  )
}
