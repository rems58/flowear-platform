import { z } from 'zod'
import { defineTool } from '../define'
import { checkArtifactQuota } from './artifact-quota'

const comparatifInput = z.object({
  title: z.string().min(3).max(120).describe('Titre du comparatif'),
  criteria: z.array(z.string().min(1).max(60)).min(1).max(8).describe('Critères de comparaison'),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        scores: z.record(z.string().max(60), z.string().max(200)).describe('Valeur ou note par critère'),
        verdict: z.string().max(300).optional(),
      })
    )
    .min(2)
    .max(8)
    .describe('Options comparées'),
  recommendation: z.string().min(3).max(500).describe('Recommandation pour cette personne, avec le pourquoi'),
})

export type ComparatifData = z.infer<typeof comparatifInput> & { artifactId: string }

/** Crée un comparatif structuré et le sauvegarde comme artefact. */
export const createComparatif = defineTool({
  name: 'create_comparatif',
  description:
    'Crée un comparatif structuré (critères, options, verdicts, recommandation) pour aider la personne à choisir. À utiliser dès qu’il y a au moins deux options à départager.',
  input: comparatifInput,
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'comparatif',
  async execute(input, ctx): Promise<ComparatifData> {
    const quota = await checkArtifactQuota(ctx)
    if (!quota.ok) return { error: quota.error } as never
    const artifact = await ctx.repo.artifacts.create({
      userId: ctx.userId,
      appSlug: ctx.appSlug,
      conversationId: ctx.conversationId,
      type: 'comparatif',
      title: input.title,
      data: input,
    })
    await ctx.repo.events.track({
      name: 'artifact_created',
      userId: ctx.userId,
      appSlug: ctx.appSlug,
      props: { type: 'comparatif', artifactId: artifact.id },
    })
    return { ...input, artifactId: artifact.id }
  },
})
