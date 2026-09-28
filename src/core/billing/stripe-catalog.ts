import 'server-only'
import type Stripe from 'stripe'
import type { AppDefinition } from '@/apps/types'
import { pick } from '@/core/i18n/locale'
import { priceFor, type BillingInterval } from './prices'

/**
 * Catalogue Stripe des IA. Une IA = un produit Stripe portant son nom, créé au premier
 * besoin depuis son manifeste : la page de paiement affiche « S'abonner à Flowear : Rémy »
 * et non un libellé générique, et ajouter une IA ne demande aucune manipulation dans Stripe.
 *
 * Code fiscal exigé par Managed Payments : IA en ligne, usage personnel.
 */
const TAX_CODE = 'txcd_10105001'

/** Identifiant de produit déterministe : deux créations simultanées ne font pas deux produits. */
function productId(slug: string): string {
  return `flowear_app_${slug}`
}

/**
 * Clé de prix incluant le montant : changer un tarif crée un nouveau prix Stripe au lieu de
 * réutiliser l'ancien, et les abonnés en cours gardent celui qu'ils ont souscrit.
 */
function lookupKey(slug: string, interval: BillingInterval, cents: number): string {
  return `flowear_app_${slug}_${interval}_${cents}`
}

/** Prix résolus, gardés en mémoire : Stripe n'est interrogé qu'une fois par processus. */
const cache = new Map<string, string>()

/** Langue du catalogue Stripe : un produit n'a qu'un nom et qu'une description, quelle que soit la langue de l'acheteur. Le lancement est en France. */
const CATALOG_LOCALE = 'fr'

async function ensureProduct(stripe: Stripe, app: AppDefinition): Promise<string> {
  const id = productId(app.slug)
  const name = pick(app.name, CATALOG_LOCALE)
  // Ce que l'abonnement débloque, dit pour cette IA (le `pitch` du manifeste), sinon la tagline.
  const description = pick(app.pitch ?? app.tagline, CATALOG_LOCALE)
  try {
    const existing = await stripe.products.retrieve(id)
    if (!existing.deleted) {
      // Le manifeste a pu changer depuis la création : on aligne, sans bloquer le paiement si ça échoue.
      if (existing.description !== description || existing.name !== `Flowear : ${name}`) {
        await stripe.products.update(id, { name: `Flowear : ${name}`, description }).catch(() => undefined)
      }
      return existing.id
    }
  } catch {
    /* absent : on le crée juste en dessous */
  }
  try {
    const created = await stripe.products.create({
      id,
      name: `Flowear : ${name}`,
      description,
      tax_code: TAX_CODE,
      metadata: { flowear_app: app.slug },
    })
    return created.id
  } catch {
    // Création concurrente : le produit existe désormais, on le relit.
    return (await stripe.products.retrieve(id)).id
  }
}

/** Identifiant du prix Stripe pour cette IA et cette périodicité, créé au besoin. */
export async function resolveAppPriceId(stripe: Stripe, app: AppDefinition, interval: BillingInterval): Promise<string> {
  const cents = priceFor('app', interval) * 100
  const key = lookupKey(app.slug, interval, cents)
  const cached = cache.get(key)
  if (cached) return cached

  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })
  if (found.data[0]) {
    cache.set(key, found.data[0].id)
    return found.data[0].id
  }

  const product = await ensureProduct(stripe, app)
  const price = await stripe.prices.create({
    product,
    currency: 'eur',
    unit_amount: cents,
    recurring: { interval: interval === 'yearly' ? 'year' : 'month' },
    // Le prix affiché est le prix payé, TVA comprise : c'est ce qu'attend un particulier.
    tax_behavior: 'inclusive',
    lookup_key: key,
    metadata: { flowear_app: app.slug, flowear_interval: interval },
  })
  cache.set(key, price.id)
  return price.id
}

/** Réservé aux tests. */
export function resetStripeCatalogCache(): void {
  cache.clear()
}
