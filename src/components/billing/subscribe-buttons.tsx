'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BillingInterval, CheckoutTarget } from '@/core/billing/prices'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/i18n/messages'
import { useI18n } from '@/lib/i18n/provider'

interface SubscribeButtonProps {
  /** Dégradé de la marque de l'IA sur le bouton (page tarifs par IA). */
  gradient?: string
  /** Stripe configuré côté serveur : sinon les boutons laissent place au message « bientôt ». */
  enabled: boolean
  /** IA à abonner pour l'offre « une IA » ; absente, le bouton renvoie choisir une IA. */
  appSlug: string | null
  interval: BillingInterval
  target: CheckoutTarget
}

/** Bouton d'abonnement : ouvre une session Stripe Checkout et suit l'URL renvoyée. */
export function SubscribeButton({ enabled, appSlug, interval, target, gradient }: SubscribeButtonProps) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subscribe() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, interval, appSlug: target === 'app' ? appSlug : undefined }),
      })
      const body = (await res.json().catch(() => null)) as { data?: { url?: string }; error?: { code?: string; message?: string } } | null
      if (!res.ok || !body?.data?.url) {
        setError(errorMessage(t, body?.error?.code, body?.error?.message ?? t.billing.failed))
        return
      }
      window.location.href = body.data.url
    } catch {
      setError(t.billing.failed)
    } finally {
      setPending(false)
    }
  }

  if (!enabled) return <p className="text-sm text-muted-foreground">{t.billing.unavailable}</p>
  if (target === 'app' && !appSlug) {
    return (
      <Button render={<Link href="/" />} nativeButton={false} variant="outline" className="w-full rounded-full">
        {t.billing.pickApp}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className={`w-full rounded-full ${gradient ? 'text-white shadow-lg hover:opacity-90' : ''}`} style={gradient ? { background: gradient } : undefined} size="lg" onClick={() => void subscribe()} disabled={pending}>
        {pending ? t.onboarding.pending : t.billing.subscribe}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Lien vers le portail Stripe : changer de carte, passer au bundle, annuler. */
export function ManageSubscriptionButton() {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)

  async function openPortal() {
    setPending(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const body = (await res.json().catch(() => null)) as { data?: { url?: string } } | null
      if (body?.data?.url) window.location.href = body.data.url
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="outline" size="sm" className="rounded-full" onClick={() => void openPortal()} disabled={pending}>
      {t.billing.manage}
    </Button>
  )
}
