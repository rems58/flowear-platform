import type { ReactNode } from 'react'
import type { KillColor } from '@/core/admin/kill'
import { L } from '@/lib/admin/labels'

/** Carte à grand chiffre : une question, une réponse, un contexte. */
export function StatCard({ label, value, sub, spark, accent }: { label: string; value: string; sub?: string; spark?: number[]; accent?: 'red' }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-black/[0.06] bg-card p-4 dark:border-white/[0.08]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className={`text-3xl font-semibold tracking-tight ${accent === 'red' ? 'text-red-500' : ''}`}>{value}</p>
        {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
      </div>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

/**
 * Courbe minimale en SVG, sans bibliothèque : une carte n'a besoin que de la tendance.
 * Les valeurs sont ramenées entre 0 et 1 sur la hauteur, le temps s'étale sur la largeur.
 */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values, 1)
  const step = width / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 text-[#5E5CE6]">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Tableau sobre : en-têtes discrets, lignes séparées d'un trait, chiffres alignés à droite. */
export function Table({ head, rows, empty }: { head: ReactNode[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-t border-black/[0.06] dark:border-white/[0.08]">
              {cells.map((c, i) => (
                <td key={i} className={`px-3 py-2 ${i > 0 ? 'text-right tabular-nums' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const VERDICT: Record<KillColor, string> = {
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  orange: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-600 dark:text-red-400',
  grey: 'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.1]',
}

export function VerdictBadge({ color }: { color: KillColor }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT[color]}`}>{L.app[color]}</span>
}

const SEVERITY: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  low: 'bg-black/[0.06] text-muted-foreground dark:bg-white/[0.1]',
}

export function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY[severity]}`}>{L.inbox.severity[severity]}</span>
}

/** Une marche de l'entonnoir : le compte, et la part de la marche précédente qui l'a franchie. */
export function FunnelBar({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(steps[0]?.value ?? 0, 1)
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value
        const rate = prev === null || prev === 0 ? null : s.value / prev
        return (
          <li key={s.label} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{s.label}</span>
            <div className="h-6 overflow-hidden rounded-md bg-black/[0.04] dark:bg-white/[0.06]">
              <div className="h-full rounded-md bg-[#5E5CE6]" style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0)}%` }} />
            </div>
            <span className="text-right tabular-nums">
              {s.value}
              {rate !== null ? <span className="ml-1 text-xs text-muted-foreground">{Math.round(rate * 100)} %</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
