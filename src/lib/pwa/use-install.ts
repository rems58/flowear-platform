'use client'

import { useSyncExternalStore } from 'react'
import { INSTALLABLE_EVENT, INSTALLED_EVENT, pendingInstallEvent } from './boot'
import { isIos, isStandalone, isTouchDevice } from './client'

/**
 * État de l'invitation à installer, partagé par ses deux présentations : la bannière en
 * haut de la conversation, et l'entrée discrète du menu quand la bannière a été fermée.
 *
 * L'état ne vit pas dans un composant mais ici, dans un petit dépôt de module doublé du
 * stockage local : les deux présentations restent d'accord sans se passer de propriétés,
 * et le refus survit au rechargement.
 */

const DISMISS_DAYS = 30

function storageKey(slug: string): string {
  return `flowear.install.${slug}`
}

function dismissedRecently(slug: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey(slug))
    if (!raw) return false
    return Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000
  } catch {
    // Stockage indisponible (navigation privée) : on considère que c'est refusé, plutôt
    // que de remettre la bannière en haut de l'écran à chaque page.
    return true
  }
}

const listeners = new Set<() => void>()
let attached = false
let installed = false

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Branché une seule fois pour toute la page : l'annonce du navigateur et la confirmation
  // d'installation concernent l'application entière, pas un composant en particulier.
  if (!attached && typeof window !== 'undefined') {
    attached = true
    window.addEventListener(INSTALLABLE_EVENT, emit)
    window.addEventListener(INSTALLED_EVENT, () => {
      installed = true
      emit()
    })
  }
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Instantané sous forme de chaîne : React compare les instantanés par valeur, un objet
 * fabriqué à chaque lecture provoquerait une boucle de rendu.
 */
function snapshot(slug: string): string {
  if (installed || !isTouchDevice() || isStandalone()) return 'hidden'
  const platform = isIos() ? 'ios' : 'prompt'
  return `${platform}|${dismissedRecently(slug) ? '1' : '0'}|${pendingInstallEvent() ? '1' : '0'}`
}

export interface Install {
  /** Une installation est possible et vaut la peine d'être proposée. */
  available: boolean
  /** Sur iPhone, le navigateur ne propose rien : on explique le geste. */
  ios: boolean
  /** La bannière a été fermée : il ne reste que l'entrée du menu. */
  dismissed: boolean
  dismiss: () => void
  /** Ouvre la boîte de dialogue du navigateur. Sans effet sur iPhone. */
  install: () => Promise<void>
}

export function useInstall(slug: string): Install {
  const snap = useSyncExternalStore(subscribe, () => snapshot(slug), () => 'hidden')
  const [platform, dismissedFlag, eventFlag] = snap.split('|')
  const ios = platform === 'ios'
  // Sur Android et sur ordinateur, rien n'est proposé tant que le navigateur n'a pas jugé
  // l'installation possible : un bouton qui ne ferait rien serait pire que pas de bouton.
  const available = ios || eventFlag === '1'

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(slug), String(Date.now()))
    } catch {
      /* stockage indisponible : le refus vaut pour cette session */
    }
    emit()
  }

  async function install() {
    const event = pendingInstallEvent()
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    // Refusée dans la boîte de dialogue : on range la bannière comme si elle avait été fermée.
    if (outcome === 'dismissed') dismiss()
  }

  return { available: platform !== 'hidden' && available, ios, dismissed: dismissedFlag === '1', dismiss, install }
}
