import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { after } from 'next/server'
import { listApps, listPublicApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { UPCOMING_APPS } from '@/apps/upcoming'
import { Hub, type HubApp } from '@/components/hub/hub'
import { ManifestLink } from '@/components/pwa/manifest-link'
import { UtmCapture } from '@/components/utm-capture'
import { readUtm, recordVisit } from '@/lib/analytics/visit'
import { SUPPORTED_LOCALES, pick } from '@/core/i18n/locale'
import { toPublicApp } from '@/lib/public-app'
import { BUNDLE_SLUG, resolveAccess, trialDaysLeft } from '@/core/billing/entitlements'
import { getRepo } from '@/lib/db/repo'
import { getAdminIds } from '@/lib/env'
import { currentOfferFor } from '@/core/billing/welcome-offer'
import { resolveConfig } from '@/core/config/resolve'
import { remyApp } from '@/apps/remy/manifest'
import { canSeePrivate } from '@/lib/access'
import { getLocale, resolveLocale } from '@/lib/i18n/server'

const SITE = 'https://flowear.app'

/**
 * Une adresse par langue pour les moteurs : `/?lang=fr` rend le hub en français, quel que soit
 * le robot. `x-default` reste l'adresse nue, qui suit la langue du navigateur.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { userId } = await auth()
  const { locale, source } = await resolveLocale(userId)
  return {
    alternates: {
      canonical: source === 'query' ? `${SITE}/?lang=${locale}` : SITE,
      languages: { ...Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, `${SITE}/?lang=${l}`])), 'x-default': SITE },
    },
  }
}

/**
 * Hub Flowear façon App Store : colonne de navigation, catégories, carte Tendances, rangées d'IA.
 * Les IA privées n'apparaissent qu'aux administrateurs, avec un badge. Les IA annoncées sont en « Bientôt ».
 */
export default async function HubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { userId } = await auth()
  // Après la réponse : la visite se compte sans ralentir la page, et sans être perdue
  // quand la fonction s'endort dès la réponse envoyée.
  const utm = readUtm(await searchParams)
  after(() => recordVisit('/', utm))
  const locale = await getLocale(userId)
  // Invitation au bundle : seulement à qui ne l'a pas encore, et pendant la semaine d'accueil
  // pour rappeler l'échéance. Un abonné Flowear ne voit rien.
  const repo = getRepo()
  const [bundleSubs, hubUser, hubSettings] = userId ? await Promise.all([repo.subscriptions.listActive(userId), repo.users.get(userId), repo.appSettings.list()]) : [null, null, []]
  const bundleAccess = bundleSubs ? resolveAccess(bundleSubs, BUNDLE_SLUG) : null
  // Offre de bienvenue : moitié prix le premier mois, pendant la fenêtre qui suit l'inscription.
  const bundleOffer = bundleAccess && hubUser && !getAdminIds().has(userId!) ? currentOfferFor(hubUser, resolveConfig(remyApp, hubSettings), new Date(), bundleAccess.plan) : null
  const bundleTrialDays = bundleAccess ? trialDaysLeft(bundleAccess) : null
  const showBundleUpgrade = Boolean(bundleAccess && (bundleAccess.plan === 'free' || bundleTrialDays !== null))
  // Les IA privées apparaissent aux administrateurs et aux testeurs.
  await ensureAppsLoaded()
  const apps: HubApp[] = ((await canSeePrivate(userId)) ? listApps() : listPublicApps())
    .map((app) => toPublicApp(app, locale))
    .map((a) => ({ slug: a.slug, name: a.name, tagline: a.tagline, category: a.category, access: a.access, brand: a.brand }))
  const known = new Set(apps.map((a) => a.slug))
  const upcoming: HubApp[] = UPCOMING_APPS.filter((u) => !known.has(u.slug)).map((u) => ({
    slug: u.slug,
    name: u.name,
    tagline: pick(u.tagline, locale),
    category: u.category,
    access: 'public',
    brand: u.brand,
    soon: true,
  }))
  return (
    <>
      <ManifestLink href="/manifest.webmanifest" />
      <UtmCapture />
      <Hub
        apps={apps}
        upcoming={upcoming}
        signedIn={Boolean(userId)}
        bundleUpgrade={showBundleUpgrade ? { trialDaysLeft: bundleTrialDays, offer: bundleOffer } : null}
      />
    </>
  )
}
