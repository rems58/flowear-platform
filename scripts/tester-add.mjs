/**
 * Ajoute un testeur à partir de son adresse email : cherche son compte Clerk, récupère son
 * identifiant et l'ajoute à TESTER_CLERK_USER_IDS dans .env.local.
 *
 * Un testeur voit les IA privées mais suit le parcours normal : semaine d'accueil, puis mur,
 * puis abonnement. Aucun privilège de plan, contrairement à un administrateur.
 *
 * Usage : npm run tester:add son@email.test
 */
import { readFileSync, writeFileSync } from 'node:fs'

const email = process.argv[2]
if (!email) {
  console.error('Usage : npm run tester:add son@email.test')
  process.exit(1)
}
const key = process.env.CLERK_SECRET_KEY
if (!key) {
  console.error('CLERK_SECRET_KEY manquante dans .env.local')
  process.exit(1)
}

const res = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`, {
  headers: { authorization: `Bearer ${key}` },
})
if (!res.ok) {
  console.error(`Clerk a répondu ${res.status}. Vérifie CLERK_SECRET_KEY.`)
  process.exit(1)
}
const users = await res.json()
const user = Array.isArray(users) ? users[0] : users?.data?.[0]
if (!user) {
  console.error(`Aucun compte Clerk pour ${email}. Crée-le d'abord sur /sign-up, puis relance.`)
  process.exit(1)
}

const path = '.env.local'
const file = readFileSync(path, 'utf8')
const line = /^TESTER_CLERK_USER_IDS=(.*)$/m
const current = file.match(line)?.[1] ?? ''
const ids = new Set(current.split(',').map((s) => s.trim()).filter(Boolean))
if (ids.has(user.id)) {
  console.log(`${email} est déjà testeur (${user.id}).`)
  process.exit(0)
}
ids.add(user.id)
const next = `TESTER_CLERK_USER_IDS=${[...ids].join(',')}`
writeFileSync(path, line.test(file) ? file.replace(line, next) : `${file.trimEnd()}\n${next}\n`, 'utf8')

console.log(`${email} est maintenant testeur (${user.id}).`)
console.log('Redémarre le serveur pour que la variable soit prise en compte.')
