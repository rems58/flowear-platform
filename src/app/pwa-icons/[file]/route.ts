import { notFound } from 'next/navigation'
import { getApp } from '@/apps/registry'
import { ensureAppsLoaded } from '@/lib/apps/ensure'
import { appBrand } from '@/apps/types'
import { DEFAULT_LOCALE } from '@/core/i18n/locale'
import { appIconImage, flowearIconImage, ICON_SIZES } from '@/lib/pwa/icon'

/**
 * Icônes d'installation : `/pwa-icons/<slug>-<taille>.png`, plus la variante
 * `-maskable` pour Android. `flowear` sert le logo du hub, tout autre slug est
 * cherché dans le registre des IA.
 *
 * Le nom de fichier est la seule entrée : il est validé par une expression stricte,
 * et le slug doit correspondre à une IA existante. Rien ici n'est confidentiel (une
 * icône ne révèle que ce que le hub montre déjà), donc pas de session à vérifier ;
 * l'extension `.png` fait d'ailleurs sauter la route hors du middleware.
 */
const FILE_RE = /^([a-z0-9-]{2,32})-(\d{2,3})(-maskable)?\.png$/

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params
  const match = FILE_RE.exec(file)
  if (!match) notFound()
  const [, slug, rawSize, maskable] = match
  const size = Number(rawSize)
  if (!(ICON_SIZES as readonly number[]).includes(size)) notFound()
  const request = { size, maskable: Boolean(maskable) }
  if (slug === 'flowear') return flowearIconImage(request)
  await ensureAppsLoaded()
  const app = getApp(slug)
  if (!app) notFound()
  // L'initiale de repli vient de l'anglais : une icône installée ne change pas de dessin
  // quand la personne change de langue.
  return appIconImage(appBrand(app, DEFAULT_LOCALE), request)
}
