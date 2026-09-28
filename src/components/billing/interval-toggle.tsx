'use client'

import { BILLING_INTERVALS, type BillingInterval } from '@/core/billing/prices'
import { useI18n } from '@/lib/i18n/provider'

/** Mensuel ou annuel : un simple sélecteur, l'état vit chez le parent. */
export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  const { t } = useI18n()
  return (
    <div className="inline-flex rounded-full bg-black/[0.06] p-1 dark:bg-white/[0.1]">
      {BILLING_INTERVALS.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-pressed={value === i}
          className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${value === i ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {i === 'yearly' ? t.billing.yearly : t.billing.monthly}
        </button>
      ))}
    </div>
  )
}
