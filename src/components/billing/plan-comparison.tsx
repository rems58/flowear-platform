'use client'

import { BellRing, Check, ClipboardList, FileText, Globe, Heart, Lock, MessageSquare, Sparkles } from 'lucide-react'
import type { Brand } from '@/apps/types'
import type { ComparisonRow } from '@/core/billing/comparison'
import { useI18n } from '@/lib/i18n/provider'

const ICONS = { messages: MessageSquare, model: Sparkles, artifacts: FileText, web: Globe, reminders: BellRing, retake: ClipboardList, open: Heart } as const

/**
 * Tableau gratuit contre abonné d'une IA, calculé par le serveur depuis ses réglages, dans le
 * style des panneaux d'outils : une carte par ligne, l'icône aux couleurs de l'IA, un cadenas
 * sur ce que le gratuit bride, et ce qui reste ouvert dit clairement.
 */
export function PlanComparison({ rows, brand }: { rows: ComparisonRow[]; brand?: Brand | null }) {
  const { t } = useI18n()
  const gradient = brand ? `linear-gradient(135deg, ${brand.from}, ${brand.to})` : undefined
  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t.pricing.compare.title}</h2>
        <div className="hidden gap-3 text-xs sm:flex">
          <span className="w-36 text-muted-foreground">{t.pricing.compare.free}</span>
          <span className="w-36 font-medium">{t.pricing.compare.paid}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const Icon = ICONS[r.key as keyof typeof ICONS] ?? Heart
          return (
            <li key={r.key} className="flex flex-col gap-3 rounded-2xl border border-black/[0.06] bg-card px-4 py-3 sm:flex-row sm:items-center dark:border-white/[0.08]">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: gradient ?? 'var(--primary)' }} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="text-[15px] font-medium leading-snug">{r.label}</span>
              </div>
              {/* Téléphone : deux lignes nettes, l'étiquette courte à gauche, la valeur à droite. Ordinateur : deux colonnes fixes. */}
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-2 text-sm sm:flex sm:shrink-0 sm:gap-3">
                <span className="text-sm leading-5 text-muted-foreground sm:hidden">{t.pricing.compare.freeShort}</span>
                <span className="flex items-center gap-1.5 leading-5 text-muted-foreground sm:w-36">
                  {r.locked ? <Lock className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> : <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />}
                  <span>{r.free}</span>
                </span>
                <span className="text-sm font-medium leading-5 sm:hidden">{t.pricing.compare.paidShort}</span>
                <span className="flex items-center gap-1.5 font-medium leading-5 sm:w-36">
                  <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <span>{r.paid}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="px-1 text-xs text-muted-foreground">{t.pricing.compare.trial}</p>
    </section>
  )
}
