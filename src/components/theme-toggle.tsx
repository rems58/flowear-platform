'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/provider'
import { THEMES, type Theme } from '@/lib/theme/theme'
import { useTheme } from '@/lib/theme/use-theme'

const ICONS: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon }

/** Un bouton qui tourne : comme l'appareil → clair → sombre. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()
  const Icon = ICONS[theme]
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`rounded-full ${className}`}
      onClick={() => setTheme(next)}
      aria-label={`${t.theme.label} : ${t.theme[theme]}`}
      title={t.theme[theme]}
    >
      <Icon />
    </Button>
  )
}
