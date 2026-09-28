import { createGroq } from '@ai-sdk/groq'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import type { ModelTier, ProviderId } from '@/core/config/defaults'
import type { AppConfig } from '@/core/config/schema'

/** Clés API des fournisseurs, lues côté serveur uniquement (voir `src/lib/env.ts`). */
export type ProviderKeys = Partial<Record<ProviderId, string>>

export interface ModelCandidate {
  provider: ProviderId
  modelId: string
  model: LanguageModel
}

type Factory = (modelId: string) => LanguageModel

const factories = new Map<string, Factory>()

function factoryFor(provider: ProviderId, apiKey: string): Factory {
  const cacheKey = `${provider}:${apiKey.slice(-6)}`
  const cached = factories.get(cacheKey)
  if (cached) return cached
  let factory: Factory
  switch (provider) {
    case 'openrouter': {
      const p = createOpenRouter({ apiKey, appName: 'Flowear', appUrl: 'https://flowear.app' })
      // Hébergeurs par ordre de préférence pour les modèles ouverts (gpt-oss) : Groq, puis Cerebras ;
      // OpenRouter bascule tout seul sur un autre si les deux tombent. Sans effet sur un modèle
      // qui n'a qu'un hébergeur (Gemini).
      factory = (id) => p.chat(id, { provider: { order: ['groq', 'cerebras'], allow_fallbacks: true } })
      break
    }
    case 'groq': {
      const p = createGroq({ apiKey })
      factory = (id) => p(id)
      break
    }
    case 'openai': {
      const p = createOpenAI({ apiKey })
      factory = (id) => p(id)
      break
    }
    case 'mistral': {
      const p = createMistral({ apiKey })
      factory = (id) => p(id)
      break
    }
    case 'google': {
      const p = createGoogleGenerativeAI({ apiKey })
      factory = (id) => p(id)
      break
    }
  }
  factories.set(cacheKey, factory)
  return factory
}

/**
 * Candidats dans l'ordre de repli de la config, limités aux fournisseurs dont la
 * clé est présente. Le premier répond, le suivant prend le relais s'il échoue.
 */
export function buildCandidates(keys: ProviderKeys, config: AppConfig, tier: ModelTier): ModelCandidate[] {
  const out: ModelCandidate[] = []
  for (const provider of config.models.order) {
    const apiKey = keys[provider]
    const modelId = config.models[tier][provider]
    if (!apiKey || !modelId) continue
    out.push({ provider, modelId, model: factoryFor(provider, apiKey)(modelId) })
  }
  return out
}
