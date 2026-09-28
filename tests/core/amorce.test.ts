import { beforeEach, describe, expect, it } from 'vitest'
import { amorceApp } from '@/apps/amorce/manifest'
import { AMORCE_TOOLS } from '@/apps/amorce/tools'
import { pickTask } from '@/apps/amorce/tools/next-action'
import { afterSend, buildCheckinPayload, checkinUrl, runCheckins } from '@/core/checkins/run'
import { resolveConfig } from '@/core/config/resolve'
import { createMemoryRepo } from '@/core/data/memory-repo'
import type { Checkin, Task } from '@/core/data/types'
import { buildSystemPrompt } from '@/core/memory/system-prompt'
import { serializePayload } from '@/core/push/nudge'
import { addToolProvider, ensureToolsRegistered, resetTools, resolveTools, toAiToolSet } from '@/core/tools'
import { TIMER_DONE_PROMPT } from '@/core/tools/generic/focus-timer'
import type { ToolContext } from '@/core/tools/types'

const NOW = new Date('2026-09-17T08:00:00Z')

function makeCtx(overrides: Partial<ToolContext> = {}) {
  const { repo, state } = createMemoryRepo()
  const ctx: ToolContext = {
    userId: 'user_1',
    appSlug: 'amorce',
    conversationId: null,
    locale: 'fr',
    timezone: 'Europe/Paris',
    plan: 'free',
    profile: { firstName: 'Rémy', blocker: 'commencer', style: 'direct' },
    repo,
    now: () => NOW,
    knowledge: [],
    ...overrides,
  }
  return { ctx, repo, state }
}

async function run(set: ReturnType<typeof toAiToolSet>, name: string, input: unknown) {
  const t = set[name] as { execute: (i: unknown, o: unknown) => Promise<unknown> }
  return t.execute(input, { toolCallId: 'call_1', messages: [] })
}

function tools(ctx: ToolContext) {
  const config = resolveConfig(amorceApp, [])
  return toAiToolSet(resolveTools(config, 'free'), ctx, { maxOutputChars: 20_000 })
}

beforeEach(() => {
  resetTools()
  addToolProvider(() => AMORCE_TOOLS)
  ensureToolsRegistered()
})

describe('manifeste Amorce', () => {
  it('active les tâches et tous ses outils dans le registre', () => {
    expect(amorceApp.tasks.enabled).toBe(true)
    const names = resolveTools(resolveConfig(amorceApp, []), 'free').map((t) => t.name)
    for (const n of ['brain_dump', 'next_action', 'break_down', 'focus_timer', 'update_task', 'ask_choice', 'schedule_checkin', 'cancel_checkin', 'create_fiche']) expect(names).toContain(n)
  })
})

describe('brain_dump', () => {
  it('crée une tâche par entrée, avec sa première action, sans doublon', async () => {
    const { ctx, repo } = makeCtx()
    const set = tools(ctx)
    const out = (await run(set, 'brain_dump', {
      items: [
        { title: 'Répondre au mail de la CAF', firstAction: 'Ouvrir la boîte mail', energy: 'mid', estimateMin: 20 },
        { title: 'Appeler le dentiste', firstAction: 'Chercher le numéro', energy: 'high', estimateMin: 5 },
        { title: 'répondre au mail de la CAF', firstAction: 'doublon', energy: 'low' },
      ],
    })) as { created: unknown[]; merged: string[]; openCount: number }
    expect(out.created).toHaveLength(2)
    expect(out.openCount).toBe(2)
    const open = await repo.tasks.listOpen('user_1', 'amorce', 10)
    expect(open.map((t) => t.firstAction)).toEqual(['Ouvrir la boîte mail', 'Chercher le numéro'])
    // Un second dump avec le même titre ne recrée rien.
    const again = (await run(set, 'brain_dump', { items: [{ title: 'Appeler le dentiste', firstAction: 'x', energy: 'low' }] })) as { created: unknown[]; merged: string[] }
    expect(again.created).toHaveLength(0)
    expect(again.merged).toEqual(['Appeler le dentiste'])
  })

  it('ne range que ce qui est dans les mots de la personne, et refuse en silence une invention', async () => {
    const { ctx, repo } = makeCtx({ userText: 'désolé j’ai tout lâché trois jours' })
    const set = tools(ctx)
    const out = (await run(set, 'brain_dump', { items: [{ title: 'Lister les tâches en suspens', firstAction: 'Ouvrir le carnet', energy: 'low' }] })) as { error?: string; silent?: boolean }
    expect(out.error).toContain('aucune tâche')
    expect(out.silent).toBe(true)
    expect(await repo.tasks.listOpen('user_1', 'amorce', 10)).toHaveLength(0)

    const { ctx: ctx2, repo: repo2 } = makeCtx({ userText: 'je dois rappeler le dentiste et payer la CAF, j’en peux plus' })
    const kept = (await run(tools(ctx2), 'brain_dump', {
      items: [
        { title: 'Appeler le dentiste', firstAction: 'Chercher le numéro', energy: 'low' },
        { title: 'Payer la CAF', firstAction: 'Ouvrir le site', energy: 'mid' },
        { title: 'Prendre soin de soi', firstAction: 'Respirer', energy: 'low' },
      ],
    })) as { createdCount: number }
    expect(kept.createdCount).toBe(2)
    expect((await repo2.tasks.listOpen('user_1', 'amorce', 10)).map((t) => t.title)).toEqual(['Appeler le dentiste', 'Payer la CAF'])
  })

  it('ne dépasse jamais le plafond de tâches ouvertes', async () => {
    const { ctx } = makeCtx()
    const set = tools(ctx)
    const items = Array.from({ length: 20 }, (_, i) => ({ title: `Tâche ${i}`, firstAction: 'a', energy: 'low' as const }))
    await run(set, 'brain_dump', { items })
    await run(set, 'brain_dump', { items: items.map((it) => ({ ...it, title: `${it.title} b` })) })
    await run(set, 'brain_dump', { items: items.map((it) => ({ ...it, title: `${it.title} c` })) })
    const out = (await run(set, 'brain_dump', { items: [{ title: 'Une de trop', firstAction: 'a', energy: 'low' }] })) as { error?: string }
    expect(out.error).toMatch(/60/)
  })
})

describe('next_action', () => {
  const base = (over: Partial<Task>): Task => ({
    id: 'x',
    userId: 'user_1',
    appSlug: 'amorce',
    conversationId: null,
    title: 't',
    firstAction: 'a',
    steps: [],
    energy: 'mid',
    estimateMin: null,
    actualMin: null,
    status: 'open',
    createdAt: '2026-09-10T00:00:00Z',
    updatedAt: '2026-09-10T00:00:00Z',
    doneAt: null,
    ...over,
  })

  it('choisit une seule tâche qui rentre dans l énergie et le temps', () => {
    const open = [
      base({ id: 'hard', energy: 'high', estimateMin: 60 }),
      base({ id: 'long', energy: 'low', estimateMin: 90, createdAt: '2026-09-01T00:00:00Z' }),
      base({ id: 'short', energy: 'low', estimateMin: 10, createdAt: '2026-09-05T00:00:00Z' }),
    ]
    expect(pickTask(open, 'low', 15)?.id).toBe('short')
    expect(pickTask(open, 'low', undefined)?.id).toBe('long') // la plus ancienne qui rentre dans l'énergie
    expect(pickTask(open, 'high', 120)?.id).toBe('long')
  })

  it('les reportées passent après les ouvertes, et rien ne rentre = null', () => {
    const open = [base({ id: 'deferred', status: 'deferred', createdAt: '2026-09-01T00:00:00Z' }), base({ id: 'open', createdAt: '2026-09-09T00:00:00Z' })]
    expect(pickTask(open, 'mid', undefined)?.id).toBe('open')
    expect(pickTask([base({ id: 'hard', energy: 'high' })], 'low', undefined)).toBeNull()
  })

  it('renvoie empty quand rien n est ouvert', async () => {
    const { ctx } = makeCtx()
    const out = (await run(tools(ctx), 'next_action', { energy: 'low' })) as { task: unknown; empty: boolean }
    expect(out.empty).toBe(true)
    expect(out.task).toBeNull()
  })
})

describe('break_down et update_task', () => {
  it('découpe une tâche existante, la recoupe à la correction, coche les étapes', async () => {
    const { ctx, repo } = makeCtx()
    const set = tools(ctx)
    const dump = (await run(set, 'brain_dump', { items: [{ title: 'Faire la déclaration', firstAction: 'Ouvrir le site', energy: 'high' }] })) as { created: { id: string }[] }
    const id = dump.created[0].id
    const first = (await run(set, 'break_down', { taskId: id, title: 'Faire la déclaration', steps: ['Ouvrir le site', 'Se connecter', 'Remplir la page 1', 'Valider'] })) as { taskId: string; steps: unknown[] }
    expect(first.taskId).toBe(id)
    expect(first.steps).toHaveLength(4)
    // « trop long » : nouveau découpage, il remplace.
    const second = (await run(set, 'break_down', { taskId: id, title: 'Faire la déclaration', steps: ['Ouvrir le site', 'Valider'] })) as { steps: { done: boolean }[] }
    expect(second.steps).toHaveLength(2)
    await run(set, 'update_task', { taskId: id, status: 'open', stepIndex: 0 })
    const after = (await run(set, 'update_task', { taskId: id, status: 'open', stepIndex: 1 })) as { status: string }
    expect(after.status).toBe('done')
    expect((await repo.tasks.get(id, 'user_1', 'amorce'))?.status).toBe('done')
  })

  it('crée la tâche si elle n existe pas encore, et retrouve par titre', async () => {
    const { ctx, repo } = makeCtx()
    const set = tools(ctx)
    const out = (await run(set, 'break_down', { title: 'Ranger le bureau', steps: ['Prendre un sac', 'Jeter trois choses'] })) as { taskId: string }
    const task = await repo.tasks.get(out.taskId, 'user_1', 'amorce')
    expect(task?.firstAction).toBe('Prendre un sac')
    const again = (await run(set, 'break_down', { title: 'ranger le bureau', steps: ['Prendre un sac', 'Jeter une chose', 'Fini'] })) as { taskId: string }
    expect(again.taskId).toBe(out.taskId)
  })

  it('mesure le coefficient de temps sur les tâches finies', async () => {
    const { ctx, repo } = makeCtx()
    const set = tools(ctx)
    const dump = (await run(set, 'brain_dump', {
      items: [
        { title: 'A', firstAction: 'a', energy: 'low', estimateMin: 10 },
        { title: 'B', firstAction: 'b', energy: 'low', estimateMin: 20 },
      ],
    })) as { created: { id: string }[] }
    await run(set, 'update_task', { taskId: dump.created[0].id, status: 'done', actualMin: 20 })
    const out = (await run(set, 'update_task', { taskId: dump.created[1].id, status: 'done', actualMin: 40 })) as { timeRatio: number; measured: number }
    expect(out.measured).toBe(2)
    expect(out.timeRatio).toBe(2)
    const stats = await repo.tasks.timeStats('user_1', 'amorce')
    expect(stats.finished).toBe(2)
  })

  it('refuse une tâche d une autre personne', async () => {
    const { ctx, repo } = makeCtx()
    const [foreign] = await repo.tasks.createMany([{ userId: 'user_2', appSlug: 'amorce', conversationId: null, title: 'x', firstAction: 'y', energy: 'low', estimateMin: null }])
    const out = (await run(tools(ctx), 'update_task', { taskId: foreign.id, status: 'done' })) as { error?: string }
    expect(out.error).toBeTruthy()
  })
})

describe('prompt système avec tâches', () => {
  it('liste les tâches ouvertes avec leur identifiant et le coefficient', async () => {
    const { repo } = makeCtx()
    const [t] = await repo.tasks.createMany([{ userId: 'user_1', appSlug: 'amorce', conversationId: null, title: 'Appeler le dentiste', firstAction: 'Chercher le numéro', energy: 'high', estimateMin: 5 }])
    const prompt = buildSystemPrompt({
      app: amorceApp,
      locale: 'fr',
      profile: { firstName: 'Rémy' },
      notes: [],
      toolNames: ['next_action'],
      plan: 'free',
      tasks: { open: [t], time: { finished: 3, measured: 3, ratio: 2.2 }, now: NOW },
    })
    expect(prompt).toContain(`[${t.id}] Appeler le dentiste`)
    expect(prompt).toContain('Chercher le numéro')
    expect(prompt).toContain('×2.2')
  })

  it('demande de vider la tête quand rien n est ouvert', () => {
    const prompt = buildSystemPrompt({ app: amorceApp, locale: 'fr', profile: {}, notes: [], toolNames: [], plan: 'free', tasks: { open: [], time: { finished: 0, measured: 0, ratio: null }, now: NOW } })
    expect(prompt).toContain('brain_dump')
    expect(prompt).toContain('pas encore mesuré')
  })
})

describe('outils qui clôturent le tour', () => {
  it('les outils à carte qui attend un geste arrêtent la boucle, les autres non', () => {
    const defs = resolveTools(resolveConfig(amorceApp, []), 'free')
    const ending = defs.filter((t) => t.endsTurn).map((t) => t.name).sort()
    expect(ending).toEqual(['ask_choice', 'assessment', 'brain_dump', 'break_down', 'focus_timer', 'next_action'])
  })
})

describe('réparation des entrées d outil', () => {
  it('retire les null envoyés par le modèle, et ne touche à rien sinon', async () => {
    const { stripNulls } = await import('@/core/agent/chat')
    expect(stripNulls('{"energy":"low","minutes":null}')).toBe('{"energy":"low"}')
    expect(stripNulls('{"energy":"low"}')).toBeNull()
    expect(stripNulls('pas du json')).toBeNull()
  })
})

describe('ask_choice', () => {
  it('renvoie la question, les choix et toujours « autre »', async () => {
    const { ctx } = makeCtx()
    const out = (await run(tools(ctx), 'ask_choice', { question: 'Ton énergie là ?', options: ['À plat', 'Moyen', 'moyen ', 'En forme'] })) as { allowOther: boolean; saveAs: { kind: string }; options: { value: string; label: string }[] }
    expect(out.allowOther).toBe(true)
    expect(out.options).toEqual([{ value: 'À plat', label: 'À plat' }, { value: 'Moyen', label: 'Moyen' }, { value: 'En forme', label: 'En forme' }])
    // La question de l'énergie est reconnue et sa réponse ira dans le profil, même sans saveAs.
    expect(out.saveAs).toEqual({ kind: 'profile', key: 'energy_now' })
    const other = (await run(tools(ctx), 'ask_choice', { question: 'Tu préfères ?', options: ['Le mail', 'L’appel'] })) as { saveAs: { kind: string } }
    expect(other.saveAs.kind).toBe('none')
  })
})

describe('focus_timer', () => {
  it('calcule la fin et pose un relais par notification si un navigateur est abonné', async () => {
    const { ctx, repo } = makeCtx()
    await repo.push.save({ userId: 'user_1', appSlug: 'amorce', endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a', locale: 'fr' })
    const out = (await run(tools(ctx), 'focus_timer', { minutes: 25, task: 'Le mail' })) as { endsAt: string }
    expect(out.endsAt).toBe('2026-09-17T08:25:00.000Z')
    const relays = await repo.checkins.list('user_1', 'amorce')
    expect(relays).toHaveLength(1)
    expect(relays[0].kind).toBe('once')
    expect(relays[0].prompt).toBe(TIMER_DONE_PROMPT)
    expect(relays[0].nextRunAt).toBe('2026-09-17T08:25:00.000Z')
  })

  it('sans navigateur abonné, pas de relais', async () => {
    const { ctx, repo } = makeCtx()
    await run(tools(ctx), 'focus_timer', { minutes: 15, task: 'x' })
    expect(await repo.checkins.list('user_1', 'amorce')).toHaveLength(0)
  })
})

describe('schedule_checkin et cancel_checkin', () => {
  it('programme le prochain passage dans le fuseau de la personne', async () => {
    const { ctx, repo } = makeCtx()
    const set = tools(ctx)
    const out = (await run(set, 'schedule_checkin', { timeLocal: '08:30', message: 'Tes trois choses du jour ?', prompt: 'Mes trois choses du jour' })) as { nextRunAt: string; pushEnabled: boolean }
    // 8 h UTC = 10 h à Paris : le prochain 8 h 30 est demain, 6 h 30 UTC.
    expect(out.nextRunAt).toBe('2026-09-18T06:30:00.000Z')
    expect(out.pushEnabled).toBe(false)
    expect(await repo.checkins.list('user_1', 'amorce')).toHaveLength(1)
    const removed = (await run(set, 'cancel_checkin', {})) as { removed: number }
    expect(removed.removed).toBe(1)
  })

  it('« dans 2 minutes » : un rappel unique dans deux minutes, même si le modèle a compris 00:02', async () => {
    const { ctx, repo } = makeCtx({ userText: 'rappelle-moi dans 2 minutes de boire' })
    const out = (await run(tools(ctx), 'schedule_checkin', { timeLocal: '00:02', message: 'Bois un verre d’eau.', prompt: 'Boire' })) as { inMinutes?: number; timeLocal: string; nextRunAt: string }
    // 8 h 00 UTC + 2 min, affiché à l'heure de Paris.
    expect(out.inMinutes).toBe(2)
    expect(out.nextRunAt).toBe('2026-09-17T08:02:00.000Z')
    expect(out.timeLocal).toBe('10:02')
    const [c] = await repo.checkins.list('user_1', 'amorce')
    expect(c.kind).toBe('once')
    // Et en anglais, avec l'unité en heures, sans que le modèle l'ait dit.
    const { ctx: ctx2 } = makeCtx({ userText: 'remind me in 1 hour to call mom' })
    const out2 = (await run(tools(ctx2), 'schedule_checkin', { message: 'Call mom', prompt: 'Call' })) as { inMinutes?: number }
    expect(out2.inMinutes).toBe(60)
  })

  it('gratuit : un seul rappel actif, le second est refusé avec la mention de l abonnement', async () => {
    const { ctx } = makeCtx({ plan: 'free', limits: { artifactsPerMonth: 1, checkinsActive: 1, assessmentRetake: false } })
    const set = tools(ctx)
    const first = (await run(set, 'schedule_checkin', { timeLocal: '08:30', message: 'Tes trois choses ?', prompt: 'Mes trois choses' })) as { id?: string }
    expect(first.id).toBeTruthy()
    const second = (await run(set, 'schedule_checkin', { timeLocal: '21:00', message: 'Prépare demain', prompt: 'Demain' })) as { error?: string }
    expect(second.error).toMatch(/gratuit/)
  })

  it('refuse sans fuseau connu, et plafonne le nombre de rappels', async () => {
    const { ctx } = makeCtx({ timezone: undefined })
    const out = (await run(tools(ctx), 'schedule_checkin', { timeLocal: '08:30', message: 'abc', prompt: 'abc' })) as { error?: string }
    expect(out.error).toMatch(/Fuseau/)
    const { ctx: ctx2 } = makeCtx()
    const set = tools(ctx2)
    for (let i = 0; i < 6; i++) await run(set, 'schedule_checkin', { timeLocal: `0${i}:00`, message: 'abc', prompt: 'abc' })
    const full = (await run(set, 'schedule_checkin', { timeLocal: '09:00', message: 'abc', prompt: 'abc' })) as { error?: string }
    expect(full.error).toMatch(/6/)
  })
})

describe('cron des rappels', () => {
  it('envoie sur chaque navigateur, avance au lendemain, éteint un rappel unique', async () => {
    const { repo, state } = createMemoryRepo()
    await repo.push.save({ userId: 'u', appSlug: 'amorce', endpoint: 'https://fcm.googleapis.com/1', p256dh: 'p', auth: 'a', locale: 'fr' })
    await repo.push.save({ userId: 'u', appSlug: 'amorce', endpoint: 'https://fcm.googleapis.com/2', p256dh: 'p', auth: 'a', locale: 'fr' })
    const daily = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '08:30', timezone: 'Europe/Paris', days: null, message: 'Tes trois choses ?', prompt: 'Mes trois choses', nextRunAt: '2026-09-17T06:30:00.000Z' })
    const once = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'once', timeLocal: '06:40', timezone: 'UTC', days: null, message: 'Le mail', prompt: TIMER_DONE_PROMPT, nextRunAt: '2026-09-17T06:40:00.000Z' })
    const future = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '21:00', timezone: 'Europe/Paris', days: null, message: 'x', prompt: 'x', nextRunAt: '2026-09-17T19:00:00.000Z' })
    const sent: string[] = []
    const result = await runCheckins({
      repo,
      now: () => new Date('2026-09-17T06:45:00Z'),
      send: async (sub, payload) => {
        sent.push(`${sub.endpoint}|${JSON.parse(payload).url}`)
        return 'sent'
      },
      appName: () => 'Amorce',
      serialize: serializePayload,
    })
    expect(result).toMatchObject({ examined: 2, sent: 2, failed: 0 })
    expect(sent).toHaveLength(4)
    expect(sent[0]).toContain(`/amorce?ask=${daily.id}`)
    const after = await repo.checkins.list('u', 'amorce')
    expect(after.find((c) => c.id === daily.id)?.nextRunAt).toBe('2026-09-18T06:30:00.000Z')
    expect(after.find((c) => c.id === once.id)?.active).toBe(false)
    expect(after.find((c) => c.id === future.id)?.nextRunAt).toBe('2026-09-17T19:00:00.000Z')
    expect(state.events.filter((e) => e.name === 'checkin_sent')).toHaveLength(2)
  })

  it('saute un rappel trop en retard, retire un abonnement périmé, réessaie après un échec', async () => {
    const { repo } = createMemoryRepo()
    await repo.push.save({ userId: 'u', appSlug: 'amorce', endpoint: 'https://fcm.googleapis.com/gone', p256dh: 'p', auth: 'a', locale: 'fr' })
    const stale = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '08:30', timezone: 'Europe/Paris', days: null, message: 'x', prompt: 'x', nextRunAt: '2026-09-16T06:30:00.000Z' })
    const due = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '08:00', timezone: 'Europe/Paris', days: null, message: 'x', prompt: 'x', nextRunAt: '2026-09-17T06:00:00.000Z' })
    const now = () => new Date('2026-09-17T06:10:00Z')
    const first = await runCheckins({ repo, now, send: async () => 'expired', appName: () => 'Amorce', serialize: serializePayload })
    expect(first).toMatchObject({ examined: 2, sent: 0, skipped: 2, expired: 1 })
    expect(await repo.push.listForUserApp('u', 'amorce')).toHaveLength(0)
    const list = await repo.checkins.list('u', 'amorce')
    expect(list.find((c) => c.id === stale.id)?.nextRunAt).toBe('2026-09-17T06:30:00.000Z')
    expect(list.find((c) => c.id === due.id)?.nextRunAt).toBe('2026-09-18T06:00:00.000Z')

    const broken = await repo.checkins.create({ userId: 'u', appSlug: 'amorce', kind: 'daily', timeLocal: '08:05', timezone: 'Europe/Paris', days: null, message: 'x', prompt: 'x', nextRunAt: '2026-09-17T06:05:00.000Z' })
    await repo.push.save({ userId: 'u', appSlug: 'amorce', endpoint: 'https://fcm.googleapis.com/ok', p256dh: 'p', auth: 'a', locale: 'fr' })
    const second = await runCheckins({
      repo,
      now,
      send: async () => {
        throw new Error('réseau')
      },
      appName: () => 'Amorce',
      serialize: serializePayload,
    })
    expect(second.failed).toBe(1)
    expect((await repo.checkins.list('u', 'amorce')).find((c) => c.id === broken.id)?.nextRunAt).toBe('2026-09-17T06:05:00.000Z')
  })

  it('construit le lien et le payload', () => {
    const c = { id: 'abc', appSlug: 'amorce', kind: 'daily', timeLocal: '08:00', timezone: 'Europe/Paris', days: [1, 2], message: 'Hello', prompt: 'p', nextRunAt: '2026-09-17T06:00:00.000Z', lastSentAt: null, active: true, createdAt: '', userId: 'u' } satisfies Checkin
    expect(checkinUrl(c)).toBe('/amorce?ask=abc')
    expect(buildCheckinPayload(c, 'Amorce')).toMatchObject({ title: 'Amorce', body: 'Hello', tag: 'checkin-abc' })
    // Jeudi 17 : prochain passage un lundi ou un mardi = lundi 21.
    expect(afterSend(c, new Date('2026-09-17T06:01:00Z'))?.toISOString()).toBe('2026-09-21T06:00:00.000Z')
  })
})

describe('dépistage ASRS (assessment)', () => {
  const ctxWith = (profileData: Record<string, unknown> = {}) => {
    const { ctx, repo } = makeCtx()
    const ctx2: ToolContext = { ...ctx, assessments: amorceApp.assessments }
    return { ctx: ctx2, repo, seed: async () => repo.profiles.patch('user_1', 'amorce', { firstName: 'Rémy', ...profileData }) }
  }

  it('pose les six questions une par une, puis calcule le résultat et l écrit dans le profil', async () => {
    const { ctx, repo, seed } = ctxWith()
    await seed()
    const set = tools(ctx)
    const first = (await run(set, 'assessment', { assessmentId: 'asrs' })) as { kind: string; index: number; total: number; key: string; intro: string | null; options: { value: string }[] }
    expect(first.kind).toBe('question')
    expect(first.index).toBe(1)
    expect(first.total).toBe(6)
    expect(first.intro).toContain('dépistage')
    // Réponses enregistrées comme la route /choice le fait : q1-q3 « souvent », q4-q6 « souvent » = 6 en zone.
    for (const key of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) {
      const profile = (await repo.profiles.get('user_1', 'amorce'))!.data
      const progress = (profile._assess_asrs as { answers: Record<string, string> }) ?? { answers: {} }
      progress.answers[key] = 'often'
      await repo.profiles.patch('user_1', 'amorce', { _assess_asrs: progress })
      const next = (await run(set, 'assessment', { assessmentId: 'asrs' })) as { kind: string; index?: number; key?: string }
      if (key !== 'q6') {
        expect(next.kind).toBe('question')
        expect(next.key).toBe(`q${Number(key[1]) + 1}`)
      } else {
        const result = next as unknown as { kind: string; percent: number; zone: number; levelId: string; text: string; disclaimer: string }
        expect(result.kind).toBe('result')
        expect(result.zone).toBe(6)
        expect(result.percent).toBe(75)
        expect(result.levelId).toBe('high')
        expect(result.text).toContain('75 %')
        expect(result.disclaimer).toContain('pas un diagnostic')
      }
    }
    const profile = (await repo.profiles.get('user_1', 'amorce'))!.data
    expect(profile.asrs_level).toBe('high')
    expect(profile.asrs_percent).toBe(75)
    expect(profile.asrs_zone).toBe('6/6')
    expect(profile._assess_asrs).toBeUndefined()
  })

  it('« rarement » partout donne un niveau faible, et les seuils suivent la zone', async () => {
    const { ctx, repo, seed } = ctxWith()
    await seed()
    const set = tools(ctx)
    await run(set, 'assessment', { assessmentId: 'asrs' })
    await repo.profiles.patch('user_1', 'amorce', { _assess_asrs: { answers: { q1: 'rarely', q2: 'rarely', q3: 'sometimes', q4: 'rarely', q5: 'never', q6: 'sometimes' }, startedAt: 'x' } })
    const result = (await run(set, 'assessment', { assessmentId: 'asrs' })) as { levelId: string; zone: number; percent: number }
    expect(result.zone).toBe(1) // seule q3 « parfois » est en zone (q6 « parfois » ne l'est pas : seuil « souvent »)
    expect(result.levelId).toBe('low')
    expect(result.percent).toBe(Math.round((1 + 1 + 2 + 1 + 0 + 2) / 24 * 100))
  })

  it('refait dans les 90 jours : remontre le résultat au lieu de recommencer', async () => {
    const { ctx, repo, seed } = ctxWith()
    await seed()
    const set = tools(ctx)
    await run(set, 'assessment', { assessmentId: 'asrs' })
    await repo.profiles.patch('user_1', 'amorce', { _assess_asrs: { answers: { q1: 'often', q2: 'often', q3: 'often', q4: 'often', q5: 'often', q6: 'often' }, startedAt: 'x' } })
    await run(set, 'assessment', { assessmentId: 'asrs' })
    const again = (await run(set, 'assessment', { assessmentId: 'asrs' })) as { kind: string; retakeAfter: string | null; percent: number }
    expect(again.kind).toBe('result')
    expect(again.percent).toBe(75)
    expect(again.retakeAfter).toBe('2026-12-16T00:00:00.000Z')
    const restarted = (await run(set, 'assessment', { assessmentId: 'asrs', restart: true })) as { kind: string; index: number }
    expect(restarted.kind).toBe('question')
    expect(restarted.index).toBe(1)
  })

  it('les clés techniques du questionnaire ne vont pas dans le prompt', () => {
    const prompt = buildSystemPrompt({ app: amorceApp, locale: 'fr', profile: { firstName: 'Rémy', _assess_asrs: { answers: {} }, asrs_level: 'high' }, notes: [], toolNames: [], plan: 'free' })
    expect(prompt).not.toContain('_assess_asrs')
    expect(prompt).toContain('asrs_level')
  })

  it('une carte qui attend un geste clôt le tour d office, sans ligne à écrire dans l outil', async () => {
    const { saveNote } = await import('@/core/tools/generic/save-note')
    const byName = new Map(AMORCE_TOOLS.map((t) => [t.name, t]))
    expect(byName.get('next_action')?.endsTurn).toBe(true)
    expect(byName.get('break_down')?.endsTurn).toBe(true)
    expect(byName.get('brain_dump')?.endsTurn).toBe(true)
    expect(saveNote.endsTurn).toBe(false)
  })

  it('reconnaît un message venu d une carte de tâche, dans toutes les langues, sans imposer d outil', async () => {
    const { forcedToolFor, isTaskCardMessage } = await import('@/core/agent/forced-tool')
    const { getMessages } = await import('@/lib/i18n/messages')
    expect(isTaskCardMessage('Fait : Ranger le bureau', getMessages)).toBe(true)
    expect(isTaskCardMessage('Je jette : Appeler le dentiste', getMessages)).toBe(true)
    expect(isTaskCardMessage('Done: Call the dentist', getMessages)).toBe(true)
    expect(isTaskCardMessage('fait, ça m a pris 5 minutes', getMessages)).toBe(false)
    const base = { app: amorceApp, toolNames: ['update_task', 'assessment', 'ask_choice', 'next_action'], messages: getMessages, now: NOW, openTasks: 3 }
    // Énergie fraîche : la suite est une tâche ; énergie vieille ou absente : on la redemande ; plus rien d'ouvert : rien d'imposé.
    expect(forcedToolFor({ ...base, profile: { _energy_now_at: '2026-09-17T07:30:00Z' }, userText: 'Fait : Ranger le bureau' })).toBe('next_action')
    expect(forcedToolFor({ ...base, profile: { _energy_now_at: '2026-09-17T05:00:00Z' }, userText: 'Fait : Ranger le bureau' })).toBe('ask_choice')
    expect(forcedToolFor({ ...base, profile: {}, userText: 'Je jette : Appeler le dentiste' })).toBe('ask_choice')
    expect(forcedToolFor({ ...base, profile: {}, userText: 'Fait : Ranger le bureau', openTasks: 0 })).toBeNull()
    expect(forcedToolFor({ ...base, profile: {}, userText: 'je fais quoi là ?' })).toBeNull()
    // Réponse à la question d'énergie (dans n'importe quelle langue) : la seule suite est une tâche.
    expect(forcedToolFor({ ...base, profile: {}, userText: 'En forme' })).toBe('next_action')
    expect(forcedToolFor({ ...base, profile: {}, userText: 'Low' })).toBe('next_action')
    expect(forcedToolFor({ ...base, profile: {}, userText: 'En forme', openTasks: 0 })).toBeNull()
  })

  it('une excuse ou un retour après absence se répond en mots, jamais par un outil', async () => {
    const { isTextOnlyMessage } = await import('@/core/agent/forced-tool')
    expect(isTextOnlyMessage("désolé j'ai tout lâché trois jours")).toBe(true)
    expect(isTextOnlyMessage('je suis nul, journée foutue')).toBe(true)
    expect(isTextOnlyMessage("sorry, I dropped everything this week")).toBe(true)
    expect(isTextOnlyMessage('lo siento, lo dejé todo')).toBe(true)
    // Une demande, une liste ou un long message : les outils restent disponibles.
    expect(isTextOnlyMessage('désolé, je fais quoi là ?')).toBe(false)
    expect(isTextOnlyMessage('désolé, je dois rappeler le dentiste, payer la CAF, ranger la cuisine')).toBe(false)
    expect(isTextOnlyMessage('je dois rappeler le dentiste')).toBe(false)
  })

  it('gratuit : refaire un questionnaire déjà passé est réservé au Pro, le résultat revient avec la mention', async () => {
    const { ctx } = makeCtx({ plan: 'free', assessments: amorceApp.assessments, limits: { artifactsPerMonth: 1, checkinsActive: 1, assessmentRetake: false } })
    const set = tools(ctx)
    // Premier passage, toujours ouvert : six réponses via le profil, comme la route /choice le fait.
    const answers = Object.fromEntries(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((k) => [k, 'never']))
    await ctx.repo.profiles.patch('user_1', 'amorce', { _assess_asrs: { answers, startedAt: NOW.toISOString() } })
    const result = (await run(set, 'assessment', { assessmentId: 'asrs' })) as { kind: string; canRetake?: boolean }
    expect(result.kind).toBe('result')
    expect(result.canRetake).toBe(false)
    // Relance refusée : le résultat précédent est remontré, aucune nouvelle progression.
    const again = (await run(set, 'assessment', { assessmentId: 'asrs', restart: true })) as { kind: string; canRetake?: boolean }
    expect(again.kind).toBe('result')
    expect(again.canRetake).toBe(false)
    expect((await ctx.repo.profiles.get('user_1', 'amorce'))?.data._assess_asrs).toBeUndefined()
  })

  it('« Refaire le test » relance le questionnaire depuis le début, sans le modèle', async () => {
    const { directToolInput, forcedToolFor, restartAssessmentFor } = await import('@/core/agent/forced-tool')
    const { getMessages } = await import('@/lib/i18n/messages')
    expect(restartAssessmentFor(amorceApp, 'Refaire le questionnaire : Dépistage TDAH (ASRS, OMS)', getMessages)).toBe('asrs')
    expect(restartAssessmentFor(amorceApp, 'Retake the questionnaire: ADHD screening (ASRS, WHO)', getMessages)).toBe('asrs')
    expect(restartAssessmentFor(amorceApp, 'refais le test', getMessages)).toBeNull()
    const ctx = { app: amorceApp, profile: { asrs_percent: 75, asrs_date: '2026-09-17' }, userText: 'Refaire le questionnaire : Dépistage TDAH (ASRS, OMS)', toolNames: ['assessment'], messages: getMessages, now: NOW, openTasks: 0, locale: 'fr' as const }
    expect(forcedToolFor(ctx)).toBe('assessment')
    expect(directToolInput('assessment', ctx)).toEqual({ assessmentId: 'asrs', restart: true })
  })

  it('force l outil quand une réponse arrive pendant un questionnaire, pas sinon', async () => {
    const { pendingAssessmentFor } = await import('@/core/assessments/engine')
    const defs = amorceApp.assessments
    expect(pendingAssessmentFor(defs, { _assess_asrs: { answers: { q1: 'often' }, startedAt: 'x' } }, 'Très souvent')).toBe('asrs')
    expect(pendingAssessmentFor(defs, { _assess_asrs: { answers: {}, startedAt: 'x' } }, 'Often')).toBe('asrs')
    expect(pendingAssessmentFor(defs, { _assess_asrs: { answers: {}, startedAt: 'x' } }, 'je fais quoi là ?')).toBeNull()
    expect(pendingAssessmentFor(defs, {}, 'Souvent')).toBeNull()
  })

  it('l outil est imposé pendant un questionnaire, même si des tâches restent', async () => {
    const { forcedToolFor } = await import('@/core/agent/forced-tool')
    const { getMessages } = await import('@/lib/i18n/messages')
    expect(forcedToolFor({ app: amorceApp, profile: { _assess_asrs: { answers: {}, startedAt: 'x' } }, userText: 'Souvent', toolNames: ['assessment', 'ask_choice', 'next_action'], messages: getMessages, now: NOW, openTasks: 3 })).toBe('assessment')
  })

  it('un questionnaire inconnu répond une erreur, un identifiant absent prend celui en cours ou le seul déclaré', async () => {
    const { ctx, seed } = ctxWith()
    await seed()
    const set = tools(ctx)
    expect(((await run(set, 'assessment', { assessmentId: 'inconnu' })) as { error?: string }).error).toBeTruthy()
    const noId = (await run(set, 'assessment', {})) as { kind: string; assessmentId: string }
    expect(noId.kind).toBe('question')
    expect(noId.assessmentId).toBe('asrs')
  })
})
