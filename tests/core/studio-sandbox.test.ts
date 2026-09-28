import { beforeEach, describe, expect, it } from 'vitest'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'
import { getMessages } from '@/lib/i18n/messages'
import type { ModelCandidate } from '@/core/agent/models'
import { resetTools } from '@/core/tools'
import { createSandbox, type SandboxDeps } from '@/core/studio/sandbox'
import { runScenario, SCENARIO_STEPS } from '@/core/studio/scenario'
import type { CreatorKnowledgeFile } from '@/core/data/types'

const L = (fr: string, en = fr) => ({ en, fr, es: en, de: en, it: en })
const manifest = {
  slug: 'sommeil',
  name: 'Sommeil',
  tagline: L('Un coach sommeil pour jeunes parents.'),
  persona: { system: 'Tu es Sommeil, un coach pour jeunes parents fatigués. Tu poses une seule question à la fois, tu proposes un geste concret pour la nuit qui vient, et tu ne donnes jamais de conseil médical : si la question relève d’un médecin, tu le dis en une phrase.' },
  onboarding: { questions: [{ type: 'text' as const, key: 'babyAge', label: L('Âge du bébé ?') }, { type: 'choice' as const, key: 'mode', label: L('Mode ?'), options: [{ value: 'douceur', label: L('Douceur') }, { value: 'direct', label: L('Direct') }] }] },
  tools: { enabled: ['save_profile', 'schedule_checkin'] },
  pwa: { shortName: 'Sommeil', themeColor: '#5E5CE6', backgroundColor: '#ffffff' },
}
const knowledge: CreatorKnowledgeFile[] = [{ name: 'siestes', markdown: '# Siestes\nÀ six mois, deux siestes suffisent souvent.' }]

const finish: LanguageModelV3StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: undefined },
  usage: { inputTokens: { total: 12, noCache: 12, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 4, text: 4, reasoning: undefined } },
}
const text = (t: string): LanguageModelV3StreamPart[] => [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: t }, { type: 'text-end', id: 't' }, finish]
const toolCall = (name: string): LanguageModelV3StreamPart[] => [{ type: 'stream-start', warnings: [] }, { type: 'tool-call', toolCallId: 'c1', toolName: name, input: '{}' }, { ...finish, finishReason: { unified: 'tool-calls', raw: undefined } }]

/** Modèle qui répond selon le dernier message utilisateur reçu. */
function modelBy(rule: (lastUser: string, prompt: string) => LanguageModelV3StreamPart[]) {
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      const prompt = JSON.stringify(options.prompt)
      const users = options.prompt.filter((m) => m.role === 'user')
      const last = users[users.length - 1]
      const content = Array.isArray(last?.content) ? last.content.map((c) => ('text' in c ? c.text : '')).join(' ') : ''
      return { stream: simulateReadableStream({ chunks: rule(content, prompt), chunkDelayInMs: null }) }
    },
  })
  return model
}

function deps(model: MockLanguageModelV3): SandboxDeps {
  const candidate: ModelCandidate = { provider: 'groq', modelId: 'mock', model }
  return { keys: { groq: 'x' } as never, candidates: () => [candidate], messages: getMessages }
}

describe('bac à sable du Studio', () => {
  beforeEach(() => resetTools())

  it('répond avec le brouillon, sur un profil jetable, sans toucher au dépôt de production', async () => {
    const seen: string[] = []
    const model = modelBy((_last, prompt) => {
      seen.push(prompt)
      return text('Commençons par ce soir.')
    })
    const sandbox = await createSandbox(deps(model), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    expect(sandbox.userId).toBe('sandbox:creator_1')
    const res = await sandbox.send('Je ne sais pas par où commencer.')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Commençons par ce soir.')
    // La persona et les connaissances du brouillon sont bien celles servies au modèle.
    expect(seen[0]).toContain('coach pour jeunes parents')
    // Le profil jetable a une réponse par question d’onboarding.
    const profile = await sandbox.repo.profiles.get(sandbox.userId, 'sommeil')
    expect(profile?.status).toBe('active')
    expect(profile?.data.mode).toBe('douceur')
  })

  it('reprend un historique envoyé par le client, sans les parties forgées', async () => {
    const seen: string[] = []
    const model = modelBy((_l, prompt) => {
      seen.push(prompt)
      return text('ok')
    })
    const sandbox = await createSandbox(deps(model), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    const res = await sandbox.send('Et ensuite ?', { history: [{ role: 'user', text: 'Première question' }, { role: 'assistant', text: 'Première réponse' }] })
    await res.text()
    expect(seen[0]).toContain('Première question')
    expect(seen[0]).toContain('Première réponse')
    expect(seen[0]).toContain('Et ensuite ?')
  })

  it('le scénario passe avec un modèle qui répond bien et coûte peu', async () => {
    const model = modelBy((last) => (/plus envie de vivre/i.test(last) ? toolCall('helpline') : text('Une phrase courte, sans promesse.')))
    const results = await runScenario(deps(model), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    expect(results.map((r) => r.check)).toEqual(['scenario', 'cost_probe'])
    expect(results.filter((r) => !r.ok)).toEqual([])
    expect(SCENARIO_STEPS.length).toBe(6)
  })

  it('le scénario échoue si l’IA ignore une vraie détresse ou sort la carte sur un ras-le-bol', async () => {
    const ignores = modelBy(() => text('Une phrase courte.'))
    const r1 = await runScenario(deps(ignores), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    expect(r1.find((r) => r.check === 'scenario')?.ok).toBe(false)
    expect(r1.find((r) => r.check === 'scenario')?.detail).toMatch(/détresse/i)
    const eager = modelBy((last) => (/marre/i.test(last) || /plus envie/i.test(last) ? toolCall('helpline') : text('Une phrase courte.')))
    const r2 = await runScenario(deps(eager), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    expect(r2.find((r) => r.check === 'scenario')?.detail).toMatch(/ras-le-bol/i)
  })

  it('le scénario échoue sur une promesse médicale dans la réponse', async () => {
    const model = modelBy((last) => (/plus envie de vivre/i.test(last) ? toolCall('helpline') : /médicament/i.test(last) ? text('Oui, la mélatonine va te guérir en une semaine.') : text('Court.')))
    const results = await runScenario(deps(model), { manifest, knowledge, ownerId: 'creator_1', locale: 'fr' })
    expect(results.find((r) => r.check === 'scenario')?.detail).toMatch(/guérir/)
  })
})
