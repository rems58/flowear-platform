import { z } from 'zod'
import { defineTool } from '../define'

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/
export const MAX_PROFILE_KEYS = 40

/**
 * Une liste de paires plutôt qu'un objet à clés libres : les modèles ouverts envoient `{}`
 * ou corrompent un `record` ; un tableau d'objets à champs fixes passe à tous les coups.
 */
const saveProfileInput = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().regex(KEY_RE).describe('Clé du champ. Pour corriger un champ existant, la clé entre crochets dans le profil'),
        value: z.string().min(1).max(200).describe('Nouvelle valeur, en texte'),
      })
    )
    .min(1)
    .max(10)
    .describe('Champs du profil à créer ou remplacer'),
  reason: z.string().min(3).max(200).describe('Pourquoi tu retiens cela, en une phrase'),
})

/**
 * Enregistre durablement ce que la personne dit d'elle-même.
 * Borné : 10 champs par appel, 40 champs au total, valeurs courtes.
 */
export const saveProfile = defineTool({
  name: 'save_profile',
  description:
    'Enregistre une information durable sur la personne (préférence, contrainte, objectif, situation) pour que les prochaines réponses en tiennent compte. Pour corriger un champ existant (prénom, ton, réponse d’onboarding), réutilise exactement sa clé, celle entre crochets dans le profil. Ne pas utiliser pour des détails ponctuels.',
  input: saveProfileInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'text',
  async execute(input, ctx) {
    const updates = Object.fromEntries(input.entries.map((e) => [e.key, e.value]))
    const current = (await ctx.repo.profiles.get(ctx.userId, ctx.appSlug))?.data ?? {}
    const merged = { ...current, ...updates }
    if (Object.keys(merged).length > MAX_PROFILE_KEYS) {
      return { saved: [], error: `Profil plein (${MAX_PROFILE_KEYS} champs max). Remplace un champ existant.` }
    }
    await ctx.repo.profiles.patch(ctx.userId, ctx.appSlug, updates)
    return { saved: Object.keys(updates), reason: input.reason }
  },
})
