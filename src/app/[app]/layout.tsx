import type { Metadata, Viewport } from 'next'
import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { ManifestLink } from '@/components/pwa/manifest-link'
import { appIcons } from '@/core/pwa/icons'
import { pick } from '@/core/i18n/locale'
import { isSafeSlug } from '@/core/security/sanitize'
import { getLocale } from '@/lib/i18n/server'

type Params = { params: Promise<{ app: string }> }

function resolve(slug: string) {
  if (!isSafeSlug(slug)) return null
  return getApp(slug) ?? null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { app: slug } = await params
  await ensureAppsLoaded()
  const app = resolve(slug)
  if (!app) return {}
  // Installation sur l'écran d'accueil : manifeste de l'IA, pas celui du hub. Installée,
  // elle porte son nom et son icône, et sa fenêtre est cantonnée à son propre chemin.
  // Une IA privée y a droit comme les autres : ce qui la protège, c'est le contrôle d'accès
  // sur la page et sur les données, pas le fait de cacher son nom à qui devine son slug.
  const install: Metadata = {
    appleWebApp: { capable: true, title: app.pwa.shortName, statusBarStyle: 'default' },
    icons: appIcons(app.slug),
  }
  // Titre et description restent réservés aux IA publiques : eux se retrouveraient
  // dans les moteurs de recherche et les aperçus de lien.
  if (app.access === 'private') return install
  // Même résolution que la page (compte compris) : le titre suit la langue du contenu.
  const { userId } = await auth()
  const locale = await getLocale(userId)
  return { ...install, title: pick(app.name, locale), description: pick(app.tagline, locale), applicationName: app.pwa.shortName }
}

export async function generateViewport(): Promise<Viewport> {
  // Barre système : elle suit le mode de l'appareil plutôt que la couleur de l'IA, sinon
  // l'en-tête jurerait en mode clair. La couleur de marque sert au manifeste et à l'écran
  // de démarrage de l'application installée.
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
      { media: '(prefers-color-scheme: dark)', color: '#000000' },
    ],
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  }
}

/** Un slug inconnu ou mal formé = 404, avant toute requête. */
export default async function AppLayout({ children, params }: { children: React.ReactNode } & Params) {
  const { app: slug } = await params
  await ensureAppsLoaded()
  if (!resolve(slug)) notFound()
  return (
    <>
      <ManifestLink href={`/${slug}/manifest.webmanifest`} />
      {children}
    </>
  )
}
