'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LOCALE_META, SUPPORTED_LOCALES, isLocale } from '@/core/i18n/locale'
import { useI18n } from '@/lib/i18n/provider'

/**
 * Sélecteur de langue compact : le code court (FR, EN...) est affiché, le sélecteur natif
 * invisible par-dessus ouvre la liste des langues dans leur propre nom. Un choix explicite,
 * enregistré en cookie et sur le compte, puis la page est rerendue dans la nouvelle langue.
 */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function change(next: string) {
    if (!isLocale(next) || next === locale || pending) return
    setPending(true)
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={`relative inline-flex size-9 items-center justify-center rounded-full text-xs font-semibold uppercase text-muted-foreground transition hover:bg-muted hover:text-foreground ${pending ? 'opacity-50' : ''} ${className}`}>
      <span aria-hidden>{locale}</span>
      <select
        value={locale}
        onChange={(e) => void change(e.target.value)}
        disabled={pending}
        aria-label={t.common.language}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_META[l].autonym}
          </option>
        ))}
      </select>
    </span>
  )
}
