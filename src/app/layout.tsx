import type { Metadata, Viewport } from 'next'
import { auth } from '@clerk/nextjs/server'
import { deDE, enUS, esES, frFR, itIT } from '@clerk/localizations'
import { Geist, Geist_Mono } from 'next/font/google'
import type { Locale } from '@/core/i18n/locale'
import { FlowearClerkProvider } from '@/components/clerk-provider'
import { LocaleSync } from '@/components/locale-sync'
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker'
import { flowearIcons } from '@/core/pwa/icons'
import { INSTALL_BOOT_SCRIPT } from '@/lib/pwa/boot'
import { THEME_BOOT_SCRIPT } from '@/lib/theme/theme'
import { getMessages } from '@/lib/i18n/messages'
import { I18nProvider } from '@/lib/i18n/provider'
import { resolveLocale } from '@/lib/i18n/server'
import './globals.css'

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

/** Écrans Clerk (connexion, inscription, compte) dans la langue de la personne. */
const CLERK_LOCALIZATIONS: Record<Locale, typeof enUS> = { en: enUS, fr: frFR, es: esES, de: deDE, it: itIT }

export async function generateMetadata(): Promise<Metadata> {
  const { userId } = await auth()
  const { locale } = await resolveLocale(userId)
  return {
    title: { default: 'Flowear', template: '%s · Flowear' },
    description: getMessages(locale).meta.description,
    applicationName: 'Flowear',
    // Le manifeste n'est pas déclaré ici mais page par page (`ManifestLink`) : chaque IA
    // doit annoncer le sien, sinon l'installer installerait le hub.
    appleWebApp: { capable: true, title: 'Flowear', statusBarStyle: 'default' },
    icons: flowearIcons(),
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const { userId } = await auth()
  const { locale, source } = await resolveLocale(userId)
  return (
    <FlowearClerkProvider localization={CLERK_LOCALIZATIONS[locale]}>
      {/* suppressHydrationWarning : la classe `dark` est posée avant le premier rendu par le script ci-dessous. */}
      <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
        <head>
          {/* Balise script native, pas next/script : celui-ci ne l'exécuterait qu'après le chargement du bundle
              (flash clair en mode sombre). Ici le navigateur l'exécute au parsing, avant le premier rendu. */}
          <script id="flowear-theme" dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
          {/* Même raison : l'annonce d'installation passe avant l'hydratation, on la met de côté. */}
          <script id="flowear-install" dangerouslySetInnerHTML={{ __html: INSTALL_BOOT_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <I18nProvider locale={locale}>
            <LocaleSync locale={locale} fromAccount={source === 'db'} />
            <ServiceWorkerRegistrar />
            {children}
          </I18nProvider>
        </body>
      </html>
    </FlowearClerkProvider>
  )
}
