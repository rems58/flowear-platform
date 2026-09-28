import type { UIMessageChunk } from 'ai'
import type { ModelCandidate } from './models'

/**
 * Repli entre fournisseurs, indépendant de la version de spec des modèles.
 * On sonde le flux de chunks UI : si une erreur arrive AVANT la moindre sortie
 * du modèle, on passe au candidat suivant. Une erreur après un début de sortie
 * n'est pas rejouée (on ne veut pas de réponse en double).
 */
const OUTPUT_CHUNKS = new Set<string>([
  'text-start',
  'text-delta',
  'reasoning-start',
  'reasoning-delta',
  'tool-input-start',
  'tool-input-available',
  'tool-output-available',
  'source-url',
  'source-document',
  'file',
  'finish-step',
  'finish',
])

export interface StreamFallbackInput<C extends UIMessageChunk = UIMessageChunk> {
  candidates: readonly ModelCandidate[]
  run: (candidate: ModelCandidate) => ReadableStream<C> | Promise<ReadableStream<C>>
  onFallback?: (failed: ModelCandidate, error: string) => void | Promise<void>
}

export class NoProviderError extends Error {
  constructor(message = 'Aucun fournisseur IA disponible') {
    super(message)
    this.name = 'NoProviderError'
  }
}

export async function streamWithFallback<C extends UIMessageChunk = UIMessageChunk>(
  input: StreamFallbackInput<C>
): Promise<{ candidate: ModelCandidate; stream: ReadableStream<C> }> {
  let lastError = 'aucun candidat'
  for (const candidate of input.candidates) {
    let reader: ReadableStreamDefaultReader<C>
    try {
      reader = (await input.run(candidate)).getReader()
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await input.onFallback?.(candidate, lastError)
      continue
    }

    const buffered: C[] = []
    let failed = false
    let ended = false
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        ended = true
        break
      }
      buffered.push(value)
      if (value.type === 'error') {
        failed = true
        lastError = (value as { errorText?: string }).errorText ?? 'erreur fournisseur'
        break
      }
      if (OUTPUT_CHUNKS.has(value.type)) break
    }

    if (failed) {
      await reader.cancel().catch(() => undefined)
      await input.onFallback?.(candidate, lastError)
      continue
    }

    const stream = new ReadableStream<C>({
      async start(controller) {
        for (const chunk of buffered) controller.enqueue(chunk)
        if (ended) {
          controller.close()
          return
        }
        try {
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
      async cancel() {
        await reader.cancel().catch(() => undefined)
      },
    })
    return { candidate, stream }
  }
  throw new NoProviderError(`Aucun fournisseur IA n'a répondu (${lastError})`)
}

/** Même logique pour un appel non streamé : premier candidat qui ne lève pas. */
export async function generateWithFallback<T>(input: {
  candidates: readonly ModelCandidate[]
  run: (candidate: ModelCandidate) => Promise<T>
  onFallback?: (failed: ModelCandidate, error: string) => void | Promise<void>
}): Promise<{ candidate: ModelCandidate; result: T }> {
  let lastError = 'aucun candidat'
  for (const candidate of input.candidates) {
    try {
      const result = await input.run(candidate)
      return { candidate, result }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await input.onFallback?.(candidate, lastError)
    }
  }
  throw new NoProviderError(`Aucun fournisseur IA n'a répondu (${lastError})`)
}
