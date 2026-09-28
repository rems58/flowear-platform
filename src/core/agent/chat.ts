import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId as aiGenerateId,
  InvalidToolInputError,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai'
import type { AppDefinition } from '@/apps/types'
import { SUPPORTED_LOCALES, type Locale } from '@/core/i18n/locale'
import type { Messages } from '@/lib/i18n/messages'
import { quotaSince } from '@/core/admin/actions'
import { checkDailyQuota, estimateCostUsd, hasKnownPrice, quotaWindowStart, resolveAccess } from '@/core/billing/entitlements'
import { resolveConfig } from '@/core/config/resolve'
import type { AppSetting } from '@/core/config/schema'
import type { ModelTier } from '@/core/config/defaults'
import type { Repo } from '@/core/data/repo'
import { startOfUtcDay, startOfUtcMonth } from '@/core/data/time'
import { asLocale, buildSystemPrompt } from '@/core/memory/system-prompt'
import { extractMemories } from '@/core/memory/extract'
import { searchKnowledge, type KnowledgeChunk } from '@/core/knowledge/search'
import type { WebSearchFn } from '@/core/search/types'
import { isGenericAnswer } from '@/core/quality/generic'
import { sanitizeText } from '@/core/security/sanitize'
import { ensureToolsRegistered, resolveTools, toAiToolSet, type ToolContext } from '@/core/tools'
import { directToolInput, forcedToolFor, isEnergyFresh, isTextOnlyMessage } from './forced-tool'
import { ChatError } from './errors'
import { createBareToolNameGuard, createChoiceLineGuard, createToolJsonGuard } from './json-guard'
import { streamWithFallback } from './fallback'
import { buildCandidates, type ModelCandidate, type ProviderKeys } from './models'
import { defaultTitle, generateTitle } from './title'

export interface ChatDeps {
  repo: Repo
  keys: ProviderKeys
  now?: () => Date
  generateId?: () => string
  /** Tests : remplace la construction des candidats par fournisseur. */
  candidates?: (tier: ModelTier) => ModelCandidate[]
  /** Base de connaissances de l'IA, chargée par la route (fichiers Markdown). */
  knowledge?: KnowledgeChunk[]
  /** Recherche web du fournisseur configuré ; absente, le tool n'est pas proposé. */
  webSearch?: WebSearchFn
  /** Journal serveur (jamais renvoyé au client). */
  log?: (level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) => void
  /**
   * Travail à faire une fois la réponse fermée (titre, mémoire, alerte de coût) : la route
   * le branche sur `after()` de Next, les tests l'exécutent en ligne. Absent = en ligne.
   */
  defer?: (work: () => Promise<void>) => void
  /** Dictionnaires, pour reconnaître les messages générés par les cartes (« Fait : … »). */
  messages?: (locale: Locale) => Messages
}

export interface ChatRequest {
  userId: string
  app: AppDefinition
  locale: string
  conversationId: string | null
  messages: UIMessage[]
  /** Réglages déjà lus par la route (évite une seconde lecture). */
  settings?: AppSetting[]
  /** Administrateur : plan payant d'office, aucun quota de messages. */
  isAdmin?: boolean
  /** Fuseau IANA du navigateur : sert aux rappels programmés. */
  timezone?: string
}


/** Relance quand le modèle n'a rien dit : une consigne courte, dans la langue des instructions. */
const NUDGE_EMPTY = "Ta réponse précédente était vide. Réponds maintenant à la personne, en une ou deux phrases, dans sa langue, en suivant tes instructions."
const NUDGE_EMPTY_NEXT = "Ta réponse précédente était vide. Propose maintenant une seule tâche avec next_action, selon l'énergie du profil, sans rien écrire d'autre."
const NUDGE_EMPTY_ASK = "Ta réponse précédente était vide. Demande maintenant à la personne son énergie du moment avec ask_choice (options en texte : « À plat », « Moyen », « En forme » ; saveAs none), dans sa langue, sans rien écrire d'autre."

/** Retire les champs à `null` d'une entrée d'outil (JSON) ; null si rien ne change ou si ce n'est pas du JSON. */
export function stripNulls(input: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const clean: Record<string, unknown> = {}
  let changed = false
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v === null) changed = true
    else clean[k] = v
  }
  return changed ? JSON.stringify(clean) : null
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => p.text)
    .join('\n')
}

/**
 * Boucle agent complète pour un message :
 * config résolue → plan et quota → conversation possédée → prompt personnalisé →
 * tools autorisés → streaming avec repli entre fournisseurs → persistance.
 * Toute erreur métier est une ChatError, traduite en HTTP par la route.
 */
export async function handleChat(deps: ChatDeps, req: ChatRequest): Promise<Response> {
  const now = deps.now ?? (() => new Date())
  const generateId = deps.generateId ?? aiGenerateId
  const log = deps.log ?? (() => undefined)
  // Sans `defer` fourni (tests, développement sans framework), le travail différé est attendu en fin de réponse.
  const inline: Promise<void>[] = []
  const defer = deps.defer ?? ((work: () => Promise<void>) => { inline.push(work()) })
  const repo = deps.repo
  const { app, userId } = req

  const settings = req.settings ?? (await repo.appSettings.list())
  const config = resolveConfig(app, settings)

  if (!Array.isArray(req.messages) || req.messages.length === 0 || req.messages.length > 400) {
    throw new ChatError('bad_request', 400, 'Messages invalides')
  }
  const last = req.messages[req.messages.length - 1]
  if (last.role !== 'user') throw new ChatError('bad_request', 400, 'Le dernier message doit venir de l’utilisateur')
  const userText = sanitizeText(textOf(last), config.agent.maxUserMessageChars)
  if (!userText) throw new ChatError('bad_request', 400, 'Message vide')

  const profile = await repo.profiles.get(userId, app.slug)
  if (!profile || profile.status !== 'active') {
    throw new ChatError('onboarding_required', 403, 'Onboarding à terminer avant de discuter')
  }

  const [subscriptions, user] = await Promise.all([repo.subscriptions.listActive(userId), repo.users.get(userId)])
  const access = resolveAccess(subscriptions, app.slug, now())
  const plan = req.isAdmin ? 'paid' : access.plan
  // La fenêtre mensuelle commence au passage en gratuit s'il est plus récent que le 1er du mois :
  // l'usage de la semaine d'accueil ne se compte jamais contre le quota gratuit. Une remise à
  // zéro par l'admin l'emporte sur les deux fenêtres.
  const reset = user?.quotaResetAt
  const dayStart = quotaSince(startOfUtcDay(now()), reset)
  const windowStart = quotaSince(quotaWindowStart(access, startOfUtcMonth(now())), reset)
  const [messagesToday, messagesMonth, costTodayUsd, costMonthUsd, bonus] = await Promise.all([
    repo.usage.countMessagesSince(userId, app.slug, dayStart),
    repo.usage.countMessagesSince(userId, app.slug, windowStart),
    repo.usage.costSince(userId, app.slug, dayStart),
    repo.usage.costSince(userId, app.slug, windowStart),
    // Messages gagnés par vidéo aujourd'hui (gratuit) : ils s'ajoutent au quota du jour.
    plan === 'free' ? repo.rewards.today(userId, app.slug, startOfUtcDay(now()).toISOString().slice(0, 10)) : Promise.resolve({ videos: 0, messages: 0 }),
  ])
  // La semaine d'accueil a le plan payant mais ses propres plafonds de coût ; l'admin n'en a aucun.
  const quota = checkDailyQuota({ plan, config, messagesToday, messagesMonth, costTodayUsd, costMonthUsd, trialing: !req.isAdmin && access.trialEndsAt !== null, bonusMessagesToday: bonus.messages })
  if (!quota.allowed) {
    await repo.events.track({ name: 'quota_hit', userId, appSlug: app.slug, props: { plan, reason: quota.reason } })
    // Un code par raison : le client affiche le bon message (jour, mois, coût) dans sa langue.
    const code = quota.reason === 'messages_month' ? 'quota_exceeded_month' : quota.reason === 'cost' ? 'cost_exceeded' : quota.reason === 'cost_month' ? 'cost_exceeded_month' : 'quota_exceeded'
    throw new ChatError(code, 429, 'Quota atteint', { plan, limit: quota.limit, reason: quota.reason })
  }

  let conversation = req.conversationId ? await repo.conversations.get(req.conversationId, userId, app.slug) : null
  if (req.conversationId && !conversation) throw new ChatError('conversation_not_found', 404, 'Conversation introuvable')
  const isNewConversation = !conversation
  if (!conversation) conversation = await repo.conversations.create(userId, app.slug, defaultTitle(req.locale))
  const conversationId = conversation.id

  // L'historique est reconstruit depuis la base, jamais rejoué depuis le client : le client
  // ne fournit que son nouveau message. Aucune partie forgée (outil, fichier) ne peut
  // entrer dans le contexte du modèle, et l'identifiant stocké est généré côté serveur.
  const userMessageId = generateId()
  const stored = isNewConversation ? [] : await repo.messages.list(conversationId, userId, config.agent.historyWindow)
  const newUserMessage: UIMessage = { id: userMessageId, role: 'user', parts: [{ type: 'text', text: userText }] }
  let history: UIMessage[] = [
    ...stored.map(
      (m): UIMessage => ({ id: m.id, role: m.role === 'system' ? 'assistant' : m.role, parts: m.parts as UIMessage['parts'] })
    ),
    newUserMessage,
  ].slice(-config.agent.historyWindow)
  while (history.length && history[0].role !== 'user') history = history.slice(1)

  await repo.messages.append({
    id: userMessageId,
    conversationId,
    userId,
    appSlug: app.slug,
    role: 'user',
    parts: [{ type: 'text', text: userText }],
  })

  ensureToolsRegistered()
  // Un tool qui exige une dépendance absente n'est pas montré au modèle : il ne peut pas
  // choisir un outil qui échouerait.
  const toolDefs = resolveTools(config, plan, (def) => def.name !== 'search_web' || Boolean(deps.webSearch))
  let toolCalled = false
  // Coûts déclarés par les tools pendant ce message (recherche web) : ajoutés au coût du modèle.
  let toolCostUsd = 0
  const toolCtx: ToolContext = {
    userId,
    appSlug: app.slug,
    conversationId,
    locale: req.locale,
    timezone: req.timezone,
    userText,
    plan,
    profile: profile.data,
    repo,
    now,
    knowledge: deps.knowledge ?? [],
    assessments: app.assessments,
    limits: {
      artifactsPerMonth: config.plans[plan]?.artifactsPerMonth ?? Number.MAX_SAFE_INTEGER,
      checkinsActive: config.plans[plan]?.checkinsActive ?? Number.MAX_SAFE_INTEGER,
      assessmentRetake: config.plans[plan]?.assessmentRetake ?? true,
    },
    webSearch: deps.webSearch,
    charge: (usd) => {
      toolCostUsd += usd
    },
  }
  const tools = toAiToolSet(toolDefs, toolCtx, {
    maxOutputChars: config.agent.maxToolOutputChars,
    onCall: async (report) => {
      if (report.ok) toolCalled = true
      await repo.events.track({
        name: report.ok ? 'tool_called' : 'tool_failed',
        userId,
        appSlug: app.slug,
        props: { tool: report.name, durationMs: report.durationMs, error: report.error, conversationId },
      })
    },
  })

  const [notes, artifacts, openTasks, timeStats] = await Promise.all([
    repo.notes.list(userId, app.slug, config.agent.maxNotesInPrompt),
    repo.artifacts.list(userId, app.slug, config.agent.maxArtifactsInPrompt),
    app.tasks.enabled ? repo.tasks.listOpen(userId, app.slug, app.tasks.maxInPrompt) : Promise.resolve([]),
    app.tasks.enabled ? repo.tasks.timeStats(userId, app.slug) : Promise.resolve(null),
  ])
  const knowledgeHits = app.knowledge.enabled ? searchKnowledge(deps.knowledge ?? [], userText, app.knowledge.topK) : []
  const system = buildSystemPrompt({
    app,
    locale: req.locale,
    profile: profile.data,
    notes,
    artifacts,
    knowledge: knowledgeHits,
    toolNames: toolDefs.map((t) => t.name),
    plan,
    tasks: app.tasks.enabled && timeStats ? { open: openTasks, time: timeStats, now: now() } : undefined,
  })

  const buildFor = deps.candidates ?? ((tier: ModelTier) => buildCandidates(deps.keys, config, tier))
  // Deux vitesses : le tier de modèle dépend du plan (gratuit = petit, abonné = gros).
  const candidates = buildFor(config.plans[plan]?.modelTier ?? 'big')
  if (candidates.length === 0) throw new ChatError('no_provider', 503, 'Aucun fournisseur IA configuré')

  let modelMessages
  try {
    modelMessages = await convertToModelMessages(history)
  } catch (error) {
    log('warn', 'convertToModelMessages a échoué', { error: String(error) })
    throw new ChatError('bad_request', 400, 'Historique de messages invalide')
  }

  const startedAt = Date.now()
  // Premier jeton reçu du fournisseur : ce que la personne attend avant de voir quelque chose.
  let firstTokenAt: number | null = null
  const endsTurnTools = new Set(toolDefs.filter((t) => t.endsTurn).map((t) => t.name))
  // Message venu d'un bouton de carte (réponse de questionnaire, « Fait : … ») : l'outil
  // attendu est imposé au premier pas, le modèle ne peut ni conclure ni l'écrire en texte.
  const forcedCtx = deps.messages ? { app, profile: profile.data, userText, toolNames: toolDefs.map((t) => t.name), messages: deps.messages, now: now(), openTasks: openTasks.length } : null
  const forcedTool = forcedCtx ? forcedToolFor(forcedCtx) : null
  const textOnly = !forcedTool && isTextOnlyMessage(userText)
  // Suite connue du produit : l'outil est exécuté ici, le modèle n'est pas appelé du tout.
  const directInput = forcedTool && forcedCtx ? directToolInput(forcedTool, { ...forcedCtx, locale: asLocale(req.locale) }) : null
  let muted = false
  const jsonGuard = createToolJsonGuard(toolDefs)
  const nameGuard = createBareToolNameGuard(toolDefs.map((t) => t.name))
  // Boutons d'énergie écrits en texte : jetés, et la vraie question est posée par le code.
  const choiceGuard = createChoiceLineGuard(deps.messages ? SUPPORTED_LOCALES.map((l) => deps.messages!(l).tasks.energyChoices) : [])
  let askedChoice = false
  // L'usage est lu sur le résultat du candidat retenu (promesse résolue en fin de flux),
  // jamais depuis un callback dont l'ordre d'exécution n'est pas garanti.
  const results = new Map<ModelCandidate, { totalUsage: PromiseLike<LanguageModelUsage> }>()
  let chosen: ModelCandidate | null = null

  const stream = createUIMessageStream({
    originalMessages: history,
    generateId,
    onError: (error) => {
      log('error', 'Erreur de flux IA', { error: error instanceof Error ? error.message : String(error) })
      // Code stable : le client le traduit dans la langue de la personne.
      return 'STREAM'
    },
    execute: async ({ writer }) => {
      /** Exécute un outil ici même et écrit sa carte dans le flux : aucun modèle dans la boucle. */
      async function runDirect(toolName: string, input: Record<string, unknown>, opening: boolean): Promise<void> {
        const toolCallId = generateId()
        if (opening) writer.write({ type: 'start', messageMetadata: { conversationId } })
        writer.write({ type: 'start-step' })
        writer.write({ type: 'tool-input-start', toolCallId, toolName })
        writer.write({ type: 'tool-input-available', toolCallId, toolName, input })
        const output: unknown = await (tools[toolName].execute as (input: unknown, options: { toolCallId: string; messages: never[]; context: undefined }) => Promise<unknown>)(input, { toolCallId, messages: [], context: undefined })
        writer.write({ type: 'tool-output-available', toolCallId, output })
        writer.write({ type: 'finish-step' })
        if (opening) writer.write({ type: 'finish' })
        log('info', 'Outil exécuté sans le modèle', { tool: toolName, atMs: Date.now() - startedAt })
      }
      if (forcedTool && directInput && tools[forcedTool]) {
        await runDirect(forcedTool, directInput, true)
        return
      }
      const result = await streamWithFallback({
        candidates,
        run: (candidate) => {
          const result = streamText({
            model: candidate.model,
            system,
            messages: modelMessages,
            tools,
            temperature: config.agent.temperature,
            maxOutputTokens: config.agent.maxOutputTokens,
            // Premier pas : outil imposé quand la suite est connue ; aucun outil sur une excuse ou un
            // retour après absence (une carte de tâche à quelqu'un qui a honte est une erreur).
            prepareStep: ({ stepNumber }) => (stepNumber !== 0 ? undefined : forcedTool ? { toolChoice: { type: 'tool', toolName: forcedTool } } : textOnly ? { toolChoice: 'none' } : undefined),
            // Un modèle qui envoie `null` pour un champ facultatif : on retire les null et on
            // revalide, plutôt que de laisser l'étape échouer et repartir.
            repairToolCall: async ({ toolCall, error }) => {
              if (!InvalidToolInputError.isInstance(error)) return null
              const repaired = stripNulls(toolCall.input)
              if (repaired === null) return null
              log('info', 'Entrée d’outil réparée', { tool: toolCall.toolName })
              return { ...toolCall, input: repaired }
            },
            // Le tour s'arrête au plafond d'étapes, ou dès qu'un outil qui attend une réponse est appelé.
            // Un outil qui clôt le tour ne le clôt que s'il a répondu sans erreur : refusé (rien à
            // ranger, plein), le modèle reprend la parole.
            stopWhen: [stepCountIs(config.agent.maxSteps), ({ steps }) => steps[steps.length - 1]?.toolResults.some((r) => endsTurnTools.has(r.toolName) && !(r.output && typeof r.output === 'object' && 'error' in r.output)) ?? false],
            // Option générique du SDK, traduite pour chaque fournisseur (gpt-oss sur Groq, gpt-5, Gemini).
            reasoning: config.agent.reasoning,
            // OpenRouter ne lit pas encore l'option générique : on lui passe l'effort dans son propre champ.
            providerOptions: { openrouter: { reasoning: { effort: config.agent.reasoning } } },
            onStepFinish: (step) => {
              log('info', 'Étape', { provider: candidate.provider, atMs: Date.now() - startedAt, finish: step.finishReason, tools: step.toolCalls.map((c) => c.toolName), out: step.usage.outputTokens, reasoning: step.usage.outputTokenDetails?.reasoningTokens })
            },
          })
          results.set(candidate, result)
          return result
            .toUIMessageStream({
            sendReasoning: false,
            sendSources: false,
            messageMetadata: ({ part }) => (part.type === 'start' ? { conversationId } : undefined),
            onError: (error) => {
              log('warn', 'Fournisseur en erreur', { provider: candidate.provider, error: error instanceof Error ? error.message : String(error) })
              return 'STREAM'
            },
            })
            .pipeThrough(
              new TransformStream({
                transform(chunk, controller) {
                  if (firstTokenAt === null && (chunk.type === 'text-delta' || chunk.type === 'tool-input-start')) firstTokenAt = Date.now()
                  // Un outil qui clôt le tour : le texte que le modèle ajoute dans la même étape
                  // (« j'attends ta réponse », des boutons redessinés) n'atteint ni l'écran ni la base.
                  if (chunk.type === 'tool-input-start' && endsTurnTools.has(chunk.toolName)) muted = true
                  // L'outil a refusé : le modèle doit répondre en texte, on cesse de le taire.
                  if (chunk.type === 'tool-output-available' && chunk.output && typeof chunk.output === 'object' && 'error' in chunk.output) muted = false
                  if (muted && chunk.type.startsWith('text-')) return
                  // Filet : un modèle qui écrit l'appel d'outil en texte (« …{"question":…} ») au lieu
                  // de l'appeler. Le bloc JSON est retenu jusqu'à sa fermeture, puis jeté s'il
                  // ressemble à une entrée d'outil, sinon rendu tel quel.
                  if (chunk.type === 'tool-input-start' && chunk.toolName === 'ask_choice') askedChoice = true
                  if (chunk.type === 'text-delta') {
                    for (const part of jsonGuard.push(chunk.delta)) {
                      for (const p2 of nameGuard.push(part)) {
                        for (const delta of choiceGuard.push(p2)) controller.enqueue({ ...chunk, delta })
                      }
                    }
                    return
                  }
                  if (chunk.type === 'text-end') {
                    const tail = [...nameGuard.push(jsonGuard.flush()), nameGuard.flush()].join('')
                    const rest = [...choiceGuard.push(tail), choiceGuard.flush()].join('')
                    if (rest) controller.enqueue({ type: 'text-delta', id: chunk.id, delta: rest })
                  }
                  controller.enqueue(chunk)
                },
              })
            )
        },
        onFallback: async (failed, error) => {
          await repo.events.track({
            name: 'provider_fallback',
            userId,
            appSlug: app.slug,
            props: { provider: failed.provider, model: failed.modelId, error: error.slice(0, 200) },
          })
        },
      })
      chosen = result.candidate
      // Le flux est relu chunk par chunk : si le modèle finit sans un mot ni un appel d'outil
      // (gpt-oss le fait parfois après un message venu d'une carte, tout part dans son
      // raisonnement), une seconde passe, sans outil, lui demande de répondre à la personne.
      const reader = result.stream.getReader()
      let visible = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (value.type === 'text-delta' || value.type === 'tool-input-start') visible = true
        writer.write(value)
      }
      // Le modèle a écrit les boutons d'énergie en texte (jetés) sans appeler ask_choice :
      // la vraie question, avec ses vrais boutons, est posée par le code.
      if (choiceGuard.dropped && !askedChoice && tools.ask_choice && deps.messages) {
        const t = deps.messages(asLocale(req.locale)).tasks
        await runDirect('ask_choice', { question: t.energyQuestion, options: [...t.energyChoices] }, false)
        visible = true
      }
      if (!visible && result.candidate) {
        // Avec des tâches ouvertes, la suite naturelle est de demander l'énergie (ask_choice) :
        // on l'impose, un modèle sans outil écrirait l'appel en texte. Sinon, une phrase.
        // Énergie fraîche : la suite est une tâche (next_action), pas la question.
        const energyFresh = isEnergyFresh(profile.data, now())
        const forced = openTasks.length === 0 ? null : energyFresh && toolDefs.some((t) => t.name === 'next_action') ? 'next_action' : toolDefs.some((t) => t.name === 'ask_choice') ? 'ask_choice' : null
        log('warn', 'Réponse vide du modèle, seconde passe', { forced })
        const retry = streamText({
          model: result.candidate.model,
          system,
          messages: [...modelMessages, { role: 'user', content: forced === 'next_action' ? NUDGE_EMPTY_NEXT : forced === 'ask_choice' ? NUDGE_EMPTY_ASK : NUDGE_EMPTY }],
          tools: forced ? tools : undefined,
          toolChoice: forced ? { type: 'tool', toolName: forced } : undefined,
          stopWhen: stepCountIs(1),
          temperature: config.agent.temperature,
          maxOutputTokens: 400,
          reasoning: config.agent.reasoning,
          providerOptions: { openrouter: { reasoning: { effort: config.agent.reasoning } } },
        })
        writer.merge(retry.toUIMessageStream({ sendReasoning: false, sendSources: false, sendStart: false, sendFinish: false }))
      }
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      const durationMs = Date.now() - startedAt
      const firstTokenMs = firstTokenAt === null ? null : firstTokenAt - startedAt
      const candidate = chosen as ModelCandidate | null
      let usage: LanguageModelUsage | undefined
      if (candidate) {
        try {
          usage = await results.get(candidate)?.totalUsage
        } catch (error) {
          log('warn', 'Usage indisponible', { error: error instanceof Error ? error.message : String(error) })
        }
      }
      const inputTokens = usage?.inputTokens ?? 0
      const outputTokens = usage?.outputTokens ?? 0
      const provider = candidate?.provider ?? 'none'
      const model = candidate?.modelId ?? 'none'

      // Aucun fournisseur n'a répondu : pas d'usage décompté, l'utilisateur n'a rien reçu.
      if (candidate) {
        if (!hasKnownPrice(config, provider, model)) log('warn', 'Modèle absent de la grille de prix, tarif de secours appliqué', { provider, model })
        const costUsd = estimateCostUsd(config, provider, model, inputTokens, outputTokens) + toolCostUsd
        await repo.usage.record({ userId, appSlug: app.slug, conversationId, provider, model, inputTokens, outputTokens, costUsd, durationMs })
        // Alerte de coût : émise une seule fois, au franchissement du seuil mensuel. Après la réponse.
        const threshold = config.costGuard.alertUsdPerUserPerMonth
        if (threshold > 0) {
          defer(async () => {
            try {
              const monthUsd = await repo.usage.costMonthUsd(userId, app.slug, now())
              if (monthUsd >= threshold && monthUsd - costUsd < threshold) {
                await repo.events.track({ name: 'cost_alert', userId, appSlug: app.slug, props: { plan, monthUsd: Number(monthUsd.toFixed(4)), threshold } })
                log('warn', 'Coût mensuel dépassé pour un utilisateur', { userId, appSlug: app.slug, plan, monthUsd, threshold })
              }
            } catch (error) {
              log('warn', 'Alerte de coût indisponible', { error: error instanceof Error ? error.message : String(error) })
            }
          })
        }
      }

      const answer = textOf(responseMessage)
      // Sans réponse d'un fournisseur, on ne juge pas la personnalisation.
      const generic = candidate ? isGenericAnswer({ text: answer, profile: profile.data, toolCalled }) : null
      if (!isAborted && responseMessage.parts.length > 0) {
        await repo.messages.append({
          id: responseMessage.id,
          conversationId,
          userId,
          appSlug: app.slug,
          role: 'assistant',
          parts: responseMessage.parts as unknown[],
          generic,
        })
      }
      await repo.events.track({
        name: 'message_sent',
        userId,
        appSlug: app.slug,
        props: { provider, model, generic, toolCalled, durationMs, firstTokenMs, plan, aborted: isAborted, conversationId },
      })
      // La conversation existe et est datée avant que la réponse se ferme ; son titre vient après.
      await repo.conversations.touch(conversationId, userId)

      // Tout ce qui suit se fait une fois la réponse fermée : la personne n'attend pas le titre
      // ni l'extraction de mémoire, et les cartes du fil deviennent actives au dernier mot.
      defer(async () => {
        const postStartedAt = Date.now()
        if (isNewConversation) {
          try {
            const title = await generateTitle(buildFor('small'), userText, req.locale)
            await repo.conversations.touch(conversationId, userId, title)
          } catch (error) {
            log('warn', 'Titre indisponible', { error: error instanceof Error ? error.message : String(error) })
          }
        }
        // Mémoire automatique : ce que la personne a révélé de durable, dédoublonné, enregistré.
        if (candidate && !isAborted) {
          try {
            const update = await extractMemories({ candidates: buildFor('small'), userText, answerText: answer, existing: notes, locale: req.locale })
            for (const id of update.forgetIds) await repo.notes.remove(id, userId)
            for (const fact of update.add) await repo.notes.add(userId, app.slug, fact, 'auto')
            if (update.add.length || update.forgetIds.length) {
              await repo.events.track({ name: 'memory_saved', userId, appSlug: app.slug, props: { added: update.add.length, forgotten: update.forgetIds.length, conversationId } })
            }
          } catch (error) {
            log('warn', 'Mémoire automatique indisponible', { error: error instanceof Error ? error.message : String(error) })
          }
        }
        log('info', 'Réponse traitée', { conversationId, firstTokenMs, streamMs: durationMs, postMs: Date.now() - postStartedAt })
      })
      if (!deps.defer) await Promise.all(inline)
    },
  })

  // L'identifiant de conversation part aussi en en-tête : le client le lit même si le flux échoue ensuite.
  return createUIMessageStreamResponse({ stream, headers: { 'x-conversation-id': conversationId } })
}
