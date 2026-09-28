import type { Metadata } from 'next'
import { listApps } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { AdminShell } from '@/components/admin/shell'
import { pick } from '@/core/i18n/locale'
import { requireAdminPage } from '@/lib/admin/access'
import { I18nProvider } from '@/lib/i18n/provider'
import { getRepo } from '@/lib/db/repo'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

/**
 * Mise en page de l'admin. L'accès est vérifié ici, avant tout rendu : un non-administrateur
 * reçoit une 404. Les pages en dessous peuvent donc lire librement.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  const reportsNew = await getRepo().reports.countNew()
  await ensureAppsLoaded()
  const apps = listApps().map((a) => ({ slug: a.slug, name: pick(a.name, 'fr') }))
  // L'admin est en français par décision : les composants partagés (bouton de notifications,
  // bascule de thème) lisent le dictionnaire de la personne, on leur impose le français ici.
  return (
    <I18nProvider locale="fr">
      <AdminShell apps={apps} reportsNew={reportsNew}>
        {children}
      </AdminShell>
    </I18nProvider>
  )
}
