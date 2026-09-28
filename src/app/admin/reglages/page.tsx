import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { PromoForm } from '@/components/admin/promo-form'
import { SettingsForm, type AppSettingsView } from '@/components/admin/settings-form'
import { Section } from '@/components/admin/ui'
import { PLAN_LIMIT_KEYS } from '@/core/admin/settings'
import { resolveConfig } from '@/core/config/resolve'
import { pick } from '@/core/i18n/locale'
import { requireAdminPage } from '@/lib/admin/access'
import { L } from '@/lib/admin/labels'
import { getRepo } from '@/lib/db/repo'

/**
 * Réglages à chaud, IA par IA. La valeur de base est celle du code et du manifeste
 * (configuration résolue sans aucun réglage), la valeur effective celle qui s'applique.
 * Voir l'écart entre les deux, c'est voir ce que l'admin a touché.
 */
export default async function SettingsPage() {
  await ensureAppsLoaded()
  await requireAdminPage()
  const settings = await getRepo().appSettings.list()
  // Offres : portée « toutes les IA », lues sur la config de la première IA (elles sont globales).
  const offers = resolveConfig(listApps()[0], settings).offers
  const views: AppSettingsView[] = listApps().map((app) => {
    const base = resolveConfig(app)
    const effective = resolveConfig(app, settings)
    // « Surcharge » veut dire : un réglage posé pour cette IA précisément. Un réglage posé
    // pour toutes les IA se voit dans l'écart mais ne se retire pas d'ici, il est listé en bas.
    const ownKeys = new Set(settings.filter((s) => s.scope !== 'all' && s.scope.length === 1 && s.scope[0] === app.slug).map((s) => s.key))
    const plan = (p: 'free' | 'paid') =>
      Object.fromEntries(PLAN_LIMIT_KEYS.map((k) => [k, { effective: effective.plans[p][k], base: base.plans[p][k], own: ownKeys.has(`plans.${p}.${k}`) }])) as AppSettingsView['plans'][typeof p]
    return {
      slug: app.slug,
      name: pick(app.name, 'fr'),
      tools: app.tools.enabled.map((name) => ({ name, enabled: effective.tools.enabled.includes(name) })),
      plans: { free: plan('free'), paid: plan('paid') },
    }
  })

  return (
    <>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">{L.settings.title}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">{L.settings.intro}</p>
      {views.map((app) => (
        <Section key={app.slug} title={app.name}>
          <SettingsForm app={app} />
        </Section>
      ))}
      <Section title={L.settings.promoTitle}>
        <PromoForm promo={offers.promo} welcomeHours={offers.welcome.hours} />
      </Section>
      <Section title={L.settings.current}>
        {settings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{L.settings.none}</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {settings.map((s, i) => (
              <li key={i} className="rounded-lg bg-black/[0.04] px-3 py-1.5 dark:bg-white/[0.06]">
                <span className="text-muted-foreground">{s.scope === 'all' ? L.settings.scopeAll : s.scope.join(', ')}</span> · {s.key} = {JSON.stringify(s.value)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
