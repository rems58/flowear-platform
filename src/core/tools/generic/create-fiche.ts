import { z } from 'zod'
import { defineTool } from '../define'
import { checkArtifactQuota } from './artifact-quota'

const ficheInput = z.object({
  title: z.string().min(3).max(120).describe('Titre court de la fiche méthode'),
  goal: z.string().min(3).max(300).describe('Ce que la personne obtient en appliquant la fiche'),
  steps: z
    .array(
      z.object({
        title: z.string().min(2).max(100),
        detail: z.string().min(2).max(600),
      })
    )
    .min(2)
    .max(12)
    .describe('Étapes concrètes, dans l’ordre'),
  tips: z.array(z.string().min(2).max(200)).max(6).optional().describe('Conseils ou pièges à éviter'),
})

export type FicheData = z.infer<typeof ficheInput> & { artifactId: string }

/**
 * Crée une fiche méthode structurée et la sauvegarde comme artefact de l'utilisateur.
 * Le client la rend en carte ; l'artefact reste dans « mes fiches ».
 */
export const createFiche = defineTool({
  name: 'create_fiche',
  description:
    'Crée une fiche méthode structurée (objectif, étapes, conseils) adaptée au profil de la personne. À utiliser quand une marche à suivre aide plus qu’un paragraphe.',
  input: ficheInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'fiche',
  async execute(input, ctx): Promise<FicheData> {
    const quota = await checkArtifactQuota(ctx)
    if (!quota.ok) return { error: quota.error } as never
    const artifact = await ctx.repo.artifacts.create({
      userId: ctx.userId,
      appSlug: ctx.appSlug,
      conversationId: ctx.conversationId,
      type: 'fiche',
      title: input.title,
      data: input,
    })
    await ctx.repo.events.track({
      name: 'artifact_created',
      userId: ctx.userId,
      appSlug: ctx.appSlug,
      props: { type: 'fiche', artifactId: artifact.id },
    })
    return { ...input, artifactId: artifact.id }
  },
})
