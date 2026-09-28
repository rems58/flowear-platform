/**
 * Affiche sur quoi chaque service est branché, pour ne jamais confondre développement et
 * production. À lancer avant de tester quelque chose de sensible.
 *
 * Usage : npm run env:check
 */
const env = process.env
const onVercel = env.VERCEL === '1'

const mode = (value, livePrefix) => {
  if (!value) return { label: 'absent', ok: false }
  return value.startsWith(livePrefix) ? { label: 'PRODUCTION', ok: true } : { label: 'test', ok: true }
}

const supabaseProject = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).hostname.split('.')[0] : 'absent'
const upstashHost = env.UPSTASH_REDIS_REST_URL ? new URL(env.UPSTASH_REDIS_REST_URL).hostname : 'absent (mémoire locale)'

const rows = [
  ['Où tourne le code', onVercel ? 'Vercel' : 'ta machine'],
  ['Adresse publique', env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3030'],
  ['Clerk', mode(env.CLERK_SECRET_KEY, 'sk_live_').label],
  ['Stripe', mode(env.STRIPE_SECRET_KEY, 'sk_live_').label],
  ['Base Supabase', supabaseProject],
  ['Redis', upstashHost],
  ['IA', [env.OPENROUTER_API_KEY && 'OpenRouter', env.GROQ_API_KEY && 'Groq', env.OPENAI_API_KEY && 'OpenAI', env.MISTRAL_API_KEY && 'Mistral', env.GEMINI_API_KEY && 'Google'].filter(Boolean).join(', ') || 'aucune'],
  ['Recherche web', env.TAVILY_API_KEY ? 'Tavily' : 'inactive (TAVILY_API_KEY)'],
  ['Emails (digest)', env.RESEND_API_KEY ? `actifs, depuis ${env.EMAIL_FROM ?? '?'}` : 'inactifs'],
  ['Notifications push', env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? 'actives' : 'inactives (npm run push:keys)'],
  ['Administrateurs', (env.ADMIN_CLERK_USER_IDS ?? '').split(',').filter(Boolean).length],
  ['Testeurs', (env.TESTER_CLERK_USER_IDS ?? '').split(',').filter(Boolean).length],
]

const width = Math.max(...rows.map(([k]) => k.length))
console.log('')
for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`)
console.log('')

// Avertissements : ce qui doit alerter avant de faire une bêtise.
const warnings = []
if (!onVercel && mode(env.CLERK_SECRET_KEY, 'sk_live_').label === 'PRODUCTION') {
  warnings.push('Clerk est en PRODUCTION sur ta machine : les comptes créés seront réels.')
}
if (!onVercel && mode(env.STRIPE_SECRET_KEY, 'sk_live_').label === 'PRODUCTION') {
  warnings.push('Stripe est en PRODUCTION sur ta machine : les paiements seront réels.')
}
if (!onVercel && supabaseProject !== 'absent') {
  warnings.push(`La base « ${supabaseProject} » est la même qu'en production : ce que tu écris en local s'y retrouve.`)
}
if (warnings.length) {
  console.log('  À savoir :')
  for (const w of warnings) console.log(`   - ${w}`)
  console.log('')
}
