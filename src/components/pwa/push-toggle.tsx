'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'
import { isIos, isStandalone, registerServiceWorker, supportsPush } from '@/lib/pwa/client'
import { subscribeToPush } from '@/lib/pwa/subscribe'

type State = 'loading' | 'off' | 'on' | 'blocked' | 'unsupported' | 'needs-install'

interface PushToggleProps {
  appSlug: string
  appName: string
  locale: string
  /** Vrai si au moins un navigateur de la personne est déjà abonné à cette IA (rendu serveur). */
  initialEnabled: boolean
  /** Route d'abonnement ; par défaut celle de l'IA. L'admin passe la sienne. */
  endpoint?: string
}

/**
 * Bouton d'activation des notifications pour une IA.
 *
 * L'état affiché croise deux sources : ce navigateur a-t-il un abonnement push (il n'y en a
 * qu'un par site, partagé par toutes les IA), et le serveur a-t-il une ligne pour cette IA.
 * Les deux sont nécessaires : un abonnement pris pour Teinty ne veut pas dire que Rémy a le
 * droit d'écrire.
 *
 * Sur iPhone, les notifications n'existent que depuis l'écran d'accueil : tant que
 * l'application est dans un onglet Safari, on explique au lieu de proposer un bouton
 * qui échouerait.
 */
export function PushToggle({ appSlug, appName, locale, initialEnabled, endpoint = `/api/v1/${appSlug}/push` }: PushToggleProps) {
  const { t, f } = useI18n()
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function read() {
      if (!supportsPush()) {
        // Sur iPhone, `PushManager` n'existe que dans l'application installée : le message
        // utile n'est pas « impossible », c'est « ajoute-la à ton écran d'accueil ».
        if (!cancelled) setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('blocked')
        return
      }
      const registration = await registerServiceWorker()
      const subscription = await registration?.pushManager.getSubscription()
      if (!cancelled) setState(subscription && initialEnabled ? 'on' : 'off')
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [initialEnabled])

  async function enable() {
    setError(null)
    setState('loading')
    try {
      setState(await subscribeToPush(endpoint, locale))
    } catch {
      setError(t.push.failed)
      setState('off')
    }
  }

  async function disable() {
    setError(null)
    setState('loading')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch(endpoint, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        // L'abonnement du navigateur est partagé par toutes les IA du site : on ne le
        // résilie pas ici, on retire seulement le droit d'écrire de cette IA. Le navigateur
        // le nettoiera de lui-même quand plus rien ne s'en servira.
      }
      setState('off')
    } catch {
      setError(t.push.failed)
      setState('on')
    }
  }

  if (state === 'unsupported') return null

  return (
    <div className="flex flex-col gap-1">
      {state === 'needs-install' ? (
        <p className="px-3 text-xs text-muted-foreground">{f(t.push.iosHint, { app: appName })}</p>
      ) : state === 'blocked' ? (
        <p className="px-3 text-xs text-muted-foreground">{t.push.blocked}</p>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="justify-start rounded-xl"
          disabled={state === 'loading'}
          onClick={state === 'on' ? disable : enable}
          aria-pressed={state === 'on'}
        >
          {state === 'on' ? <BellOff data-icon="inline-start" /> : <Bell data-icon="inline-start" />}
          {state === 'on' ? t.push.disable : t.push.enable}
        </Button>
      )}
      {error ? (
        <p role="alert" className="px-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
