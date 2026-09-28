/**
 * Crée (ou retrouve) le produit et les prix du bundle Flowear, puis affiche les variables
 * à coller dans `.env.local`. Idempotent : relancer ne crée pas de doublon.
 *
 * Les offres « une IA » ne passent pas par ici : chaque IA a son propre produit Stripe,
 * créé au premier paiement depuis son manifeste (voir `src/core/billing/stripe-catalog.ts`),
 * pour que la page de paiement affiche son nom. Ajouter une IA ne demande rien à Stripe.
 *
 * Usage : STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 */
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY manquante. Exemple : STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup')
  process.exit(1)
}
const stripe = new Stripe(key, { apiVersion: '2026-08-26.dahlia' })

// Code fiscal : « Artificial Intelligence as a Service, hébergé, usage personnel ». Managed Payments
// exige un code éligible, et c'est celui qui décrit exactement Flowear.
const TAX_CODE = 'txcd_10105001'

// Même grille que `src/core/billing/prices.ts` : 9 € par IA, 30 € le bundle, annuel = dix mois.
const CATALOG = [
  {
    tag: 'bundle',
    name: 'Flowear : toutes les IA',
    description: 'Toutes les IA Flowear, présentes et à venir.',
    prices: [
      { tag: 'bundle_monthly', euros: 30, interval: 'month', env: 'STRIPE_PRICE_BUNDLE_MONTHLY' },
      { tag: 'bundle_yearly', euros: 300, interval: 'year', env: 'STRIPE_PRICE_BUNDLE_YEARLY' },
    ],
  },
]

/**
 * Produit repéré par `metadata.flowear` : relancer le script le retrouve au lieu d'en créer un autre.
 * On liste au lieu de chercher : l'index de recherche Stripe a une minute de retard, une liste est
 * cohérente immédiatement, donc deux exécutions rapprochées ne créent pas de doublon.
 */
async function ensureProduct(entry) {
  const all = await stripe.products.list({ limit: 100, active: true })
  const found = all.data.find((p) => p.metadata?.flowear === entry.tag)
  if (found) return found
  return stripe.products.create({
    name: entry.name,
    description: entry.description,
    tax_code: TAX_CODE,
    metadata: { flowear: entry.tag },
  })
}

async function ensurePrice(product, price) {
  const all = await stripe.prices.list({ product: product.id, limit: 100, active: true })
  const found = all.data.find((p) => p.metadata?.flowear === price.tag)
  if (found) return found
  // `inclusive` : le prix affiché est le prix payé, TVA comprise. C'est ce qu'attend un particulier.
  return stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: price.euros * 100,
    recurring: { interval: price.interval },
    tax_behavior: 'inclusive',
    metadata: { flowear: price.tag },
  })
}

const lines = []
for (const entry of CATALOG) {
  const product = await ensureProduct(entry)
  console.log(`Produit ${entry.name} : ${product.id}`)
  for (const price of entry.prices) {
    const created = await ensurePrice(product, price)
    console.log(`  ${price.euros} € / ${price.interval} : ${created.id}`)
    lines.push(`${price.env}=${created.id}`)
  }
}

// Offre de bienvenue : moitié prix, une seule fois (le premier mois). Idempotent par son id.
// Le code n'applique le coupon qu'au mois, jamais à l'annuel, et seulement dans la fenêtre.
const COUPON_ID = 'flowear-bienvenue-moitie-prix'
let coupon
try {
  coupon = await stripe.coupons.retrieve(COUPON_ID)
} catch {
  coupon = await stripe.coupons.create({ id: COUPON_ID, percent_off: 50, duration: 'once', name: 'Bienvenue : moitié prix le premier mois' })
}
console.log(`Coupon de bienvenue : ${coupon.id}`)
lines.push(`STRIPE_COUPON_WELCOME=${coupon.id}`)

console.log('\nÀ coller dans .env.local (puis dans Vercel) :\n')
console.log(lines.join('\n'))
console.log('\nEnsuite : le webhook. En local, `stripe listen --forward-to localhost:3030/api/webhooks/stripe`')
console.log('donne un secret whsec_... à poser dans STRIPE_WEBHOOK_SECRET.')
console.log('\nRappel : active Managed Payments et accepte ses conditions sur')
console.log('https://dashboard.stripe.com/settings/managed-payments, sinon le paiement est refusé.')
