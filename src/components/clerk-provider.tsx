'use client'

import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { useTheme } from '@/lib/theme/use-theme'

type Localization = NonNullable<Parameters<typeof ClerkProvider>[0]['localization']>

/**
 * Habillage Flowear des écrans Clerk (connexion, inscription, compte) : couleur de marque,
 * police du site, angles arrondis, logo. Le dashboard Clerk garde la main sur les emails
 * et les pages hébergées ; ici on habille ce qui est rendu dans l'application.
 */
const BRAND = {
  variables: {
    colorPrimary: '#5E5CE6',
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    borderRadius: '0.75rem',
  },
  layout: {
    logoImageUrl: 'https://flowear.app/icon.svg',
    logoPlacement: 'inside' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
}

/** ClerkProvider côté client : la langue vient du serveur, le thème sombre suit le choix de la personne. */
export function FlowearClerkProvider({ localization, children }: { localization: Localization; children: ReactNode }) {
  const { dark: isDark } = useTheme()
  return (
    <ClerkProvider localization={localization} signInUrl="/sign-in" signUpUrl="/sign-up" appearance={isDark ? { ...BRAND, theme: dark } : BRAND}>
      {children}
    </ClerkProvider>
  )
}
