'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AccountAction } from '@/core/admin/actions'
import { L } from '@/lib/admin/labels'

/**
 * Les actions sur un compte, depuis la fiche. Chacune part vers la route de l'admin, qui
 * la journalise avant d'agir. La suppression demande l'email retapé : elle est irréversible.
 */
export function AccountActions({ userId, email, tester, creator }: { userId: string; email: string | null; tester: boolean; creator: boolean }) {
  const router = useRouter()
  const [days, setDays] = useState(7)
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(action: AccountAction) {
    setPending(action.action)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setMessage({ ok: false, text: `${L.actions.failed}${body?.error?.message ?? res.status}` })
        return
      }
      setMessage({ ok: true, text: L.actions.done })
      if (action.action === 'delete') router.push('/admin/personnes')
      else router.refresh()
    } finally {
      setPending(null)
    }
  }

  const row = 'flex flex-col gap-2 rounded-2xl border border-black/[0.06] p-4 text-sm dark:border-white/[0.08] sm:flex-row sm:items-center sm:justify-between'

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p role="status" className={`text-sm ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {message.text}
        </p>
      ) : null}

      <div className={row}>
        <div>
          <p className="font-medium">{L.actions.tester}</p>
          <p className="text-xs text-muted-foreground">{L.actions.testerHint}</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => run({ action: 'tester', enabled: !tester })}>
          {tester ? L.actions.testerOn : L.actions.testerOff}
        </Button>
      </div>

      <div className={row}>
        <div>
          <p className="font-medium">{L.actions.creator}</p>
          <p className="text-xs text-muted-foreground">{L.actions.creatorHint}</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => run({ action: 'creator', enabled: !creator })}>
          {creator ? L.actions.creatorOn : L.actions.creatorOff}
        </Button>
      </div>

      <div className={row}>
        <p className="font-medium">{L.actions.extendTrial}</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="h-8 w-20 text-sm" aria-label={L.actions.extendDays} />
          <span className="text-xs text-muted-foreground">{L.actions.extendDays}</span>
          <Button size="sm" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => run({ action: 'extend_trial', days })}>
            {L.actions.extendTrial}
          </Button>
        </div>
      </div>

      <div className={row}>
        <div>
          <p className="font-medium">{L.actions.gift}</p>
          <p className="text-xs text-muted-foreground">{L.actions.giftHint}</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => run({ action: 'gift_month' })}>
          {L.actions.gift}
        </Button>
      </div>

      <div className={row}>
        <div>
          <p className="font-medium">{L.actions.resetQuota}</p>
          <p className="text-xs text-muted-foreground">{L.actions.resetHint}</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" disabled={pending !== null} onClick={() => run({ action: 'reset_quota' })}>
          {L.actions.resetQuota}
        </Button>
      </div>

      <div className={row}>
        <div>
          <p className="font-medium">{L.actions.export}</p>
          <p className="text-xs text-muted-foreground">{L.actions.exportHint}</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" render={<a href={`/api/admin/users/${encodeURIComponent(userId)}/export`} download />} nativeButton={false}>
          {L.actions.export}
        </Button>
      </div>

      <div className={`${row} border-red-500/30`}>
        <div className="min-w-0">
          <p className="font-medium text-red-600 dark:text-red-400">{L.actions.delete}</p>
          <p className="text-xs text-muted-foreground">{L.actions.deleteHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="email" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={L.actions.deleteConfirm} className="h-8 w-56 text-sm" aria-label={L.actions.deleteConfirm} />
          <Button
            size="sm"
            variant="destructive"
            className="rounded-full"
            disabled={pending !== null || !email || confirm.trim().toLowerCase() !== email.toLowerCase()}
            onClick={() => run({ action: 'delete', confirmEmail: confirm.trim() })}
          >
            {L.actions.delete}
          </Button>
        </div>
      </div>
    </div>
  )
}
