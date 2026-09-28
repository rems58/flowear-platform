'use client'

import { Share, X } from 'lucide-react'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import type { Brand } from '@/apps/types'
import { useI18n } from '@/lib/i18n/provider'
import { useInstall } from '@/lib/pwa/use-install'

/**
 * Bannière d'installation, pleine largeur, en haut de la conversation. C'est le bon endroit
 * pour une invitation qu'on ne veut proposer qu'une fois : visible sans être modale, et
 * refusable d'un geste. Une fois fermée, elle ne revient pas : elle se replie dans le menu
 * (voir `InstallEntry`).
 *
 * Tout tient sur une rangée : l'icône de l'IA, deux lignes courtes, l'action, la croix.
 * Les textes sont volontairement brefs, sur un téléphone étroit une phrase d'explication
 * se répand sur cinq lignes et écrase le bouton.
 *
 * Safari sur iPhone n'ouvre aucune boîte de dialogue : on y remplace le bouton par le geste
 * à faire, qui est aussi la condition pour recevoir des notifications sur iOS.
 *
 * Rien ne s'affiche sur ordinateur, ni une fois l'application installée.
 */
export function InstallBanner({ slug, appName, brand }: { slug: string; appName: string; brand: Brand }) {
  const { t, f } = useI18n()
  const { available, ios, dismissed, dismiss, install } = useInstall(slug)
  if (!available || dismissed) return null

  return (
    <div className="flex items-center gap-3 border-b border-black/[0.06] bg-card px-4 py-2.5 dark:border-white/[0.08]">
      <AppIcon brand={brand} size={36} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{f(t.pwa.installTitle, { app: appName })}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs leading-tight text-muted-foreground">
          {ios ? <Share className="size-3 shrink-0" aria-hidden /> : null}
          <span className="line-clamp-2">{ios ? t.pwa.installIos : f(t.pwa.installBody, { app: appName })}</span>
        </p>
      </div>
      {ios ? null : (
        <Button size="sm" className="shrink-0 rounded-full px-4" onClick={install}>
          {t.pwa.install}
        </Button>
      )}
      <Button variant="ghost" size="icon" className="-mr-1.5 shrink-0 rounded-full text-muted-foreground" onClick={dismiss} aria-label={t.common.close}>
        <X />
      </Button>
    </div>
  )
}
