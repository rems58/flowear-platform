'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'
import { useInstall } from '@/lib/pwa/use-install'

/**
 * Repli de la bannière une fois fermée : une ligne dans le menu, juste au dessus du logo
 * Flowear. La proposition reste accessible sans jamais réoccuper le haut de l'écran.
 *
 * Sur iPhone, où il n'y a pas de boîte de dialogue à ouvrir, le bouton rappelle le geste.
 */
export function InstallEntry({ slug, appName }: { slug: string; appName: string }) {
  const { t, f } = useI18n()
  const { available, ios, dismissed, install } = useInstall(slug)
  if (!available || !dismissed) return null

  if (ios) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">{t.pwa.installIos}</p>
  }
  return (
    <Button size="sm" variant="ghost" className="justify-start rounded-xl" onClick={install}>
      <Download data-icon="inline-start" />
      {f(t.pwa.installTitle, { app: appName })}
    </Button>
  )
}
