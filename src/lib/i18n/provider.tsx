'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Locale } from '@/core/i18n/locale'
import { fmt, getMessages, type Messages } from './messages'

interface I18nValue {
  locale: Locale
  /** Dictionnaire complet de la langue courante. */
  t: Messages
  /** Interpolation : f(t.chat.greeting, { name }) */
  f: (template: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

/** Fournit la langue résolue côté serveur à tous les composants client. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({ locale, t: getMessages(locale), f: fmt }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n doit être utilisé sous I18nProvider')
  return value
}
