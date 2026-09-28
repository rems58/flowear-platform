/**
 * Génère la paire de clés VAPID des notifications push, à poser une fois et à ne plus
 * jamais changer : la clé publique est enregistrée dans chaque navigateur abonné. La
 * remplacer invaliderait tous les abonnements existants d'un coup.
 *
 * Usage : npm run push:keys
 */
import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log('\nClés VAPID générées. À coller dans .env.local, puis dans Vercel :\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log('VAPID_SUBJECT=mailto:contact@flowear.app')
console.log('\nLa clé privée est un secret : jamais dans le dépôt, jamais dans le navigateur.')
console.log('Les mêmes clés servent en développement et en production : un abonnement est lié')
console.log('au navigateur, pas à un environnement.\n')
