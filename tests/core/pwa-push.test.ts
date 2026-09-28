import { describe, expect, it } from 'vitest'
import { remyApp } from '@/apps/remy/manifest'
import { appBrand } from '@/apps/types'
import { createMemoryRepo } from '@/core/data/memory-repo'
import { buildNudge, MAX_IDLE_DAYS, MIN_IDLE_DAYS, serializePayload, shouldNudge } from '@/core/push/nudge'
import { isPushEndpoint, pushSubscriptionSchema } from '@/core/push/subscription'
import { appWebManifest, hubWebManifest, iconSet } from '@/core/pwa/manifest'
import { getMessages } from '@/lib/i18n/messages'

const FCM = 'https://fcm.googleapis.com/fcm/send/abc123'
const keys = { p256dh: 'BPuBdBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', auth: 'aUtHaUtHaUtHaUtHaUtH' }

describe('manifeste d’installation', () => {
  it('une IA est installée comme une application à part, cantonnée à son chemin', () => {
    const m = appWebManifest(remyApp, 'fr')
    // La portée n'a pas de barre oblique finale, sinon `/remy` lui-même en serait exclu.
    expect(m.scope).toBe('/remy')
    expect(m.start_url?.startsWith('/remy')).toBe(true)
    // L'identifiant ne dépend pas de l'URL de démarrage : la déplacer un jour ne créera
    // pas une deuxième installation à côté de la première.
    expect(m.id).toBe('/remy')
    expect(m.short_name).toBe(remyApp.pwa.shortName)
    expect(m.theme_color).toBe(remyApp.pwa.themeColor)
    expect(m.display).toBe('standalone')
  })

  it('emporte la langue choisie : une app installée a son stockage à elle, sans le cookie', () => {
    expect(appWebManifest(remyApp, 'fr').start_url).toBe('/remy?lang=fr')
    expect(appWebManifest(remyApp, 'de').start_url).toBe('/remy?lang=de')
    expect(hubWebManifest('Flowear', 'x', 'it').start_url).toBe('/?lang=it')
  })

  it('le nom et l’accroche suivent la langue', () => {
    expect(appWebManifest(remyApp, 'de').description).toBe('Dein Assistent, der dich wirklich kennt.')
    expect(appWebManifest(remyApp, 'it').description).toBe('Il tuo assistente che ti conosce davvero.')
  })

  it('le hub garde la portée racine et son propre jeu d’icônes', () => {
    const m = hubWebManifest('Flowear', 'Des IA qui te connaissent.', 'fr')
    expect(m.scope).toBe('/')
    expect(m.icons?.map((i) => i.src)).toContain('/pwa-icons/flowear-512-maskable.png')
  })

  it('chaque IA fournit les trois icônes attendues, dont l’adaptative Android', () => {
    const icons = iconSet('teinty') ?? []
    expect(icons.map((i) => i.src)).toEqual([
      '/pwa-icons/teinty-192.png',
      '/pwa-icons/teinty-512.png',
      '/pwa-icons/teinty-512-maskable.png',
    ])
    expect(icons.find((i) => i.purpose === 'maskable')).toBeDefined()
  })

  it('une IA sans marque déclarée reçoit quand même une icône, dérivée de son nom', () => {
    const brand = appBrand({ ...remyApp, brand: undefined }, 'en')
    expect(brand.glyph).toBe('R')
    expect(brand.from).toBe(remyApp.pwa.themeColor)
  })
})

describe('abonnement push', () => {
  it('accepte les services de push des navigateurs, refuse tout le reste', () => {
    expect(isPushEndpoint(FCM)).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    // Une URL arbitraire ferait poster notre serveur où l'attaquant veut, à la demande.
    expect(isPushEndpoint('https://evil.example.com/collect')).toBe(false)
    expect(isPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    // Pas d'accès au réseau interne non plus.
    expect(isPushEndpoint('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isPushEndpoint('pas une url')).toBe(false)
  })

  it('valide la forme envoyée par le navigateur et rejette les clés douteuses', () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: FCM, keys, locale: 'fr' }).success).toBe(true)
    expect(pushSubscriptionSchema.safeParse({ endpoint: FCM, keys: { p256dh: 'court', auth: keys.auth } }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ endpoint: FCM, keys: { p256dh: `${keys.p256dh}<script>`, auth: keys.auth } }).success).toBe(false)
    expect(pushSubscriptionSchema.safeParse({ endpoint: 'https://evil.example.com/x', keys }).success).toBe(false)
  })
})

describe('relance hebdomadaire', () => {
  const t = getMessages('fr')

  it('ne relance ni quelqu’un encore présent ni quelqu’un parti depuis longtemps', () => {
    expect(shouldNudge({ idleDays: 0 })).toBe(false)
    expect(shouldNudge({ idleDays: MIN_IDLE_DAYS - 1 })).toBe(false)
    expect(shouldNudge({ idleDays: MIN_IDLE_DAYS })).toBe(true)
    expect(shouldNudge({ idleDays: MAX_IDLE_DAYS })).toBe(true)
    expect(shouldNudge({ idleDays: MAX_IDLE_DAYS + 1 })).toBe(false)
    // Personne qui n'a jamais écrit : pas de dernier message, donc pas de relance.
    expect(shouldNudge({ idleDays: Number.POSITIVE_INFINITY })).toBe(false)
  })

  it('rappelle ce qui a été déposé, en citant la personne quand on la connaît', () => {
    const base = { appSlug: 'remy', appName: 'Rémy', firstName: 'Rémy', notes: 2, artifacts: 1, idleDays: 5 }
    const withArtifacts = buildNudge(base, t)
    expect(withArtifacts.title).toBe('Rémy, Rémy t’attend')
    expect(withArtifacts.body).toBe('Une chose faite pour toi t’attend.')
    expect(withArtifacts.url).toBe('/remy')
    // Les productions passent avant les souvenirs : c'est le plus concret.
    expect(buildNudge({ ...base, artifacts: 0 }, t).body).toContain('2 choses retenues')
    // Accord au singulier : « 1 choses retenues » se verrait tout de suite.
    expect(buildNudge({ ...base, notes: 1, artifacts: 0 }, t).body).toBe('Une chose retenue sur toi. Reprends où tu t’étais arrêté.')
    expect(buildNudge({ ...base, artifacts: 3 }, t).body).toBe('3 choses faites pour toi t’attendent.')
    expect(buildNudge({ ...base, notes: 0, artifacts: 0 }, t).body).toBe('Pose ta prochaine question, Rémy se souvient du reste.')
    expect(buildNudge({ ...base, firstName: null }, t).title).toBe('Rémy t’attend')
  })

  it('part dans la langue de l’abonnement, pas dans celle du serveur', () => {
    const input = { appSlug: 'remy', appName: 'Rémy', firstName: null, notes: 0, artifacts: 0, idleDays: 7 }
    expect(buildNudge(input, getMessages('es')).body).toContain('Haz tu siguiente pregunta')
    expect(buildNudge(input, getMessages('de')).body).toContain('Stell deine nächste Frage')
  })

  it('borne le contenu envoyé : un message push ne dépasse pas quelques kilooctets', () => {
    const payload = buildNudge({ appSlug: 'remy', appName: 'R'.repeat(400), firstName: 'A'.repeat(400), notes: 0, artifacts: 0, idleDays: 7 }, t)
    const parsed = JSON.parse(serializePayload(payload)) as { title: string; body: string }
    expect(parsed.title.length).toBeLessThanOrEqual(120)
    expect(parsed.body.length).toBeLessThanOrEqual(240)
  })
})

describe('dépôt des abonnements', () => {
  const sub = { userId: 'u1', appSlug: 'remy', endpoint: FCM, p256dh: keys.p256dh, auth: keys.auth, locale: 'fr' }

  it('un même navigateur peut suivre plusieurs IA, sans se dupliquer sur l’une d’elles', async () => {
    const { repo } = createMemoryRepo()
    await repo.push.save(sub)
    await repo.push.save({ ...sub, locale: 'en' })
    await repo.push.save({ ...sub, appSlug: 'teinty' })
    expect(await repo.push.countForApp('u1', 'remy')).toBe(1)
    expect(await repo.push.countForApp('u1', 'teinty')).toBe(1)
  })

  it('on ne désabonne que son propre navigateur, et seulement de l’IA visée', async () => {
    const { repo } = createMemoryRepo()
    await repo.push.save(sub)
    await repo.push.save({ ...sub, appSlug: 'teinty' })
    // Quelqu'un qui devine l'endpoint ne peut rien couper.
    expect(await repo.push.remove('intrus', 'remy', FCM)).toBe(false)
    expect(await repo.push.remove('u1', 'remy', FCM)).toBe(true)
    expect(await repo.push.countForApp('u1', 'remy')).toBe(0)
    expect(await repo.push.countForApp('u1', 'teinty')).toBe(1)
  })

  it('un endpoint périmé disparaît pour toutes les IA d’un coup', async () => {
    const { repo } = createMemoryRepo()
    await repo.push.save(sub)
    await repo.push.save({ ...sub, appSlug: 'teinty' })
    await repo.push.removeExpired(FCM)
    expect(await repo.push.countForApp('u1', 'remy')).toBe(0)
    expect(await repo.push.countForApp('u1', 'teinty')).toBe(0)
  })

  it('le lot de relance tourne : un abonnement servi sort de la sélection', async () => {
    const { repo } = createMemoryRepo()
    await repo.push.save(sub)
    const now = new Date('2026-09-20T10:00:00Z')
    const before = new Date(now.getTime() - 6 * 86_400_000)
    const [due] = await repo.push.listDue(before, 10)
    expect(due.endpoint).toBe(FCM)
    await repo.push.markNudged(due.id, now)
    expect(await repo.push.listDue(before, 10)).toHaveLength(0)
    // Une semaine plus tard, il redevient éligible.
    expect(await repo.push.listDue(new Date(now.getTime() + 7 * 86_400_000), 10)).toHaveLength(1)
  })
})
