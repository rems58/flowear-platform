/**
 * Identité de l'éditeur, affichée sur les pages légales (confidentialité, conditions).
 * Un seul endroit à tenir à jour. L'adresse se limite à la ville, choix assumé
 * (le détail est à l'INSEE). Les champs vides ne s'affichent pas. Le contact est l'adresse d'envoi des emails.
 */
export const PUBLISHER = {
  brand: 'Flowear',
  name: 'Rémy Magne',
  status: 'micro-entrepreneur',
  siren: '987 740 248',
  address: '58000 Nevers, France',
  email: 'contact@flowear.app',
  site: 'https://flowear.app',
  /** Date de la dernière révision des deux textes, au format ISO. */
  updatedAt: '2026-09-18',
} as const

/** Sous-traitants qui touchent des données personnelles, avec leur rôle et leur zone. */
export const PROCESSORS = [
  { name: 'Clerk', role: 'connexion et compte (email, prénom, avatar, connexion Google)', zone: 'États-Unis, clauses contractuelles types' },
  { name: 'Supabase', role: 'base de données (mémoire, conversations, tâches, rappels)', zone: 'Union européenne (Irlande)' },
  { name: 'Vercel', role: 'hébergement du site et des fonctions serveur', zone: 'Union européenne (Dublin) pour les fonctions, réseau mondial pour les pages' },
  { name: 'OpenRouter, Groq, Google AI', role: 'génération des réponses par les modèles de langage', zone: 'États-Unis, sans entraînement sur tes messages' },
  { name: 'Stripe', role: 'paiement et facturation', zone: 'Union européenne et États-Unis' },
  { name: 'Resend', role: 'envoi des emails (résumé, contact)', zone: 'États-Unis' },
  { name: 'Upstash', role: 'limitation de débit (compteur par compte, sans contenu)', zone: 'Union européenne' },
] as const
