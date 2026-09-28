import { z } from 'zod'
import { wrapUntrusted } from '@/core/security/prompt-guard'
import { defineTool } from '../define'

const recallInput = z.object({
  topic: z.string().max(120).optional().describe('Sujet recherché, vide pour tout relire'),
})

/**
 * Relit les notes et les fiches sauvegardées. Les notes ont été écrites par un
 * modèle : elles reviennent enveloppées comme données, jamais comme instructions.
 */
export const recallNotes = defineTool({
  name: 'recall_notes',
  description:
    'Relit ce que tu as retenu sur la personne (notes) et les fiches ou comparatifs déjà créés, pour ne pas te répéter et t’appuyer sur l’historique.',
  input: recallInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute(input, ctx) {
    const [notes, artifacts] = await Promise.all([
      ctx.repo.notes.list(ctx.userId, ctx.appSlug, 30),
      ctx.repo.artifacts.list(ctx.userId, ctx.appSlug, 20),
    ])
    const topic = input.topic?.trim().toLowerCase()
    const filtered = topic ? notes.filter((n) => n.content.toLowerCase().includes(topic)) : notes
    const shown = (filtered.length ? filtered : notes).slice(0, 10)
    return {
      notes: shown.length
        ? wrapUntrusted('notes_memoire', shown.map((n) => `- ${n.content}`).join('\n'))
        : 'Aucune note.',
      artifacts: artifacts.map((a) => ({ id: a.id, type: a.type, title: a.title, createdAt: a.createdAt })),
    }
  },
})
