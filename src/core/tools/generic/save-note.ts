import { z } from 'zod'
import { defineTool } from '../define'

const saveNoteInput = z.object({
  content: z.string().min(5).max(300).describe('Ce qu’il faut retenir, en une ou deux phrases, à la troisième personne'),
})

/**
 * Note de mémoire libre : ce qui ne rentre pas dans un champ de profil mais
 * changera une réponse future (« a déjà essayé X sans succès »).
 * Relue via `recall_notes`, toujours enveloppée comme donnée.
 */
export const saveNote = defineTool({
  name: 'save_note',
  description:
    'Retient une information utile pour plus tard qui ne rentre pas dans un champ de profil : ce que la personne a déjà essayé, une décision prise, un contexte. Une ou deux phrases.',
  input: saveNoteInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute(input, ctx) {
    const note = await ctx.repo.notes.add(ctx.userId, ctx.appSlug, input.content)
    return { saved: true, noteId: note.id }
  },
})
