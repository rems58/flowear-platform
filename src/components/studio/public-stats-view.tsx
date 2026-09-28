import { AppIcon } from '@/components/app-icon'
import type { PublicStats } from '@/core/studio/creator-stats'
import type { Locale } from '@/core/i18n/locale'
import { fmt, type Messages } from '@/lib/i18n/messages'

/**
 * La page de statistiques d'un créateur. Composant serveur, sans aucun lien vers le reste de
 * Flowear ni bouton : il affiche la vue partagée (`PublicStats`), rien d'autre. Utilisé tel quel
 * par la page publique à jeton et par l'aperçu de l'admin.
 */
export function PublicStatsView({ data, t, locale }: { data: PublicStats; t: Messages['stats']; locale: Locale }) {
  const n = new Intl.NumberFormat(locale)
  const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
  const pct = (v: number | null) => (v === null ? t.tooEarly : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(v))
  const monthName = (m: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))
  const day = (d: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d))
  const statusLabel = (t.status as Record<string, string>)[data.status] ?? data.status
  const card = 'rounded-2xl border border-black/[0.06] bg-card p-4 dark:border-white/[0.08]'
  const funnelSteps: [string, number][] = [
    [t.fStarted, data.funnel.started],
    [t.fOnboarded, data.funnel.onboarded],
    [t.fFirst, data.funnel.firstMessage],
    [t.fThree, data.funnel.threeMessages],
    [t.fSubscribed, data.funnel.subscribed],
  ]
  const max = Math.max(funnelSteps[0][1], 1)
  const { totals } = data.money

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <AppIcon brand={data.brand} size={56} />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.eyebrow}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {statusLabel} · {fmt(t.updated, { date: day(data.updatedAt) })}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          [t.people, data.stats.onboarded],
          [t.active7, data.stats.active7d],
          [t.active30, data.stats.active30d],
          [t.messages7, data.stats.messages7d],
          [t.messages30, data.stats.messages30d],
          [t.subscribers, data.funnel.subscribed],
        ].map(([label, value]) => (
          <div key={String(label)} className={card}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{n.format(Number(value))}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{fmt(t.moneyTitle, { share: data.sharePercent })}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t.tShare, totals.shareEur],
            [t.tPaid, totals.paidEur],
            [t.tBalance, totals.balanceEur],
            [t.tPending, totals.pendingEur],
          ].map(([label, value]) => (
            <div key={String(label)} className={card}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{eur.format(Number(value))}</p>
            </div>
          ))}
        </div>
        {data.money.months.length ? (
          <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {[t.mMonth, t.mPaying, t.mGross, t.mNet, t.mShare, t.mDue, t.mPending].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.money.months.map((m) => (
                  <tr key={m.month} className="border-t border-black/[0.06] dark:border-white/[0.08]">
                    <td className="px-4 py-2 capitalize">{monthName(m.month)}</td>
                    <td className="px-4 py-2">{n.format(m.payingUsers)}</td>
                    <td className="px-4 py-2">{eur.format(m.grossEur)}</td>
                    <td className="px-4 py-2">{eur.format(m.netEur)}</td>
                    <td className="px-4 py-2 font-medium">{eur.format(m.shareEur)}</td>
                    <td className="px-4 py-2">{eur.format(m.dueEur)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{eur.format(m.pendingEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-black/[0.1] px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/[0.12]">{t.noPayments}</p>
        )}
        <p className="text-xs text-muted-foreground">{t.netNote}</p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.funnelTitle}</h2>
          <ol className="flex flex-col gap-2">
            {funnelSteps.map(([label, value]) => (
              <li key={label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <span className="block h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: data.brand.from }} />
                </span>
                <span className="text-right tabular-nums">{n.format(value)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.cohortsTitle}</h2>
          {data.cohorts.length ? (
            <div className="overflow-x-auto rounded-2xl border border-black/[0.06] dark:border-white/[0.08]">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {[t.cWeek, t.cSignups, t.cD1, t.cD7, t.cD30].map((h) => (
                      <th key={h} className="px-4 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.week} className="border-t border-black/[0.06] dark:border-white/[0.08]">
                      <td className="px-4 py-2">{day(c.week)}</td>
                      <td className="px-4 py-2">{n.format(c.signups)}</td>
                      <td className="px-4 py-2">{pct(c.d1)}</td>
                      <td className="px-4 py-2">{pct(c.d7)}</td>
                      <td className="px-4 py-2">{pct(c.d30)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noCohorts}</p>
          )}
        </section>
      </div>
      <p className="text-xs text-muted-foreground">{t.privateNote}</p>
    </div>
  )
}
