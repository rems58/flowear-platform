/**
 * Concatène toutes les migrations dans l'ordre, pour créer une base neuve d'un seul coup.
 * Sert à monter une base de développement séparée de la production.
 *
 * Usage : npm run db:sql            (affiche)
 *         npm run db:sql > tout.sql (écrit dans un fichier)
 *
 * Ensuite : coller le résultat dans l'éditeur SQL du nouveau projet Supabase.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

console.log('-- Flowear : schéma complet, migrations concaténées dans l’ordre.')
console.log(`-- Généré le ${new Date().toISOString().slice(0, 10)} à partir de ${files.length} migrations.\n`)
for (const f of files) {
  console.log(`\n-- ===== ${f} =====\n`)
  console.log(readFileSync(join(dir, f), 'utf8').trim())
}
