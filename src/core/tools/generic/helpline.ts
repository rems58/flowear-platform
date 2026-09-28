import { z } from 'zod'
import { helplineFor, type Helpline } from '@/core/safety/helplines'
import { asLocale } from '@/core/memory/system-prompt'
import { defineTool } from '../define'

/**
 * Carte d'aide en cas de détresse. Le modèle l'appelle quand la personne parle de mort, de se
 * faire du mal, d'en finir ; les numéros viennent du code, selon le pays déduit du fuseau
 * horaire, jamais du modèle. Toujours disponible, pour toute IA, sans rien déclarer.
 */
export const helpline = defineTool({
  name: 'helpline',
  description:
    'À appeler dès que la personne exprime une détresse réelle (mots de mort, de se faire du mal, d’en finir, désespoir sans rapport avec une tâche). Affiche le numéro d’aide de son pays. Ne cite jamais un numéro toi-même : la carte le porte. Un simple ras-le-bol n’en est pas.',
  input: z.object({}),
  cost: 'low',
  cacheTtlSeconds: 0,
  requiresPlan: 'free',
  render: 'helpline',
  async execute(_input, ctx): Promise<Helpline> {
    return helplineFor(ctx.timezone, asLocale(ctx.locale))
  },
})
