import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, publisherLine } from '@/components/legal/legal-page'
import { PROCESSORS, PUBLISHER } from '@/core/legal/publisher'

export const metadata: Metadata = {
  title: 'Politique de confidentialité · Flowear',
  description: 'Ce que Flowear garde de toi, pourquoi, combien de temps, et comment le supprimer.',
}

/**
 * Politique de confidentialité, en français. Chaque affirmation correspond à ce que le code fait
 * réellement : si un mécanisme change (rétention, sous-traitant, données collectées), cette page
 * change le même jour et `PUBLISHER.updatedAt` avance.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Confidentialité"
      title="Ce que Flowear garde de toi, et pourquoi"
      intro="Flowear est un hub d’IA qui te connaissent. Pour ça, elles retiennent des choses sur toi. Cette page dit lesquelles, où elles vont, combien de temps, et comment tout effacer."
    >
      <LegalSection title="1. Qui est responsable">
        <p>{publisherLine()}</p>
        <p>
          Pour toute question sur tes données : <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>. Tu peux aussi écrire depuis le bouton
          « Un problème ? » présent dans chaque IA.
        </p>
      </LegalSection>

      <LegalSection title="2. Ce que nous collectons">
        <ul>
          <li>
            <strong>Ton compte</strong> : email, prénom éventuel, avatar, et l’identifiant fourni par Google si tu te connectes avec Google. Nous ne recevons jamais ton mot de passe.
          </li>
          <li>
            <strong>Tes conversations</strong> avec chaque IA : les messages que tu écris ou dictes, les réponses, tes pouces (utile / pas utile).
          </li>
          <li>
            <strong>La mémoire de chaque IA</strong> : ce qu’elle a retenu de toi (objectifs, habitudes, préférences), les fiches qu’elle crée, tes tâches et tes rappels. Tu la vois en clair dans la page Mémoire et tu peux effacer chaque élément.
          </li>
          <li>
            <strong>Ton profil déclaré</strong> : les réponses que tu donnes à une IA quand elle te pose des questions sur toi (par exemple le test de démarrage d’Amorce).
          </li>
          <li>
            <strong>Tes réglages</strong> : langue, thème, notifications activées ou non, abonnement au résumé par email.
          </li>
          <li>
            <strong>Ta facturation</strong> : plan, dates d’abonnement, identifiant client Stripe. Ton numéro de carte ne transite jamais par Flowear : il est saisi et conservé chez Stripe.
          </li>
          <li>
            <strong>Des mesures techniques</strong> : nombre de messages par jour, coût estimé par message, erreurs, fuseau horaire du navigateur (pour tes rappels et pour te proposer le bon numéro d’aide). Pas de suivi publicitaire, pas de pixel tiers.
          </li>
        </ul>
        <p>
          La dictée vocale utilise la reconnaissance vocale de ton navigateur : l’audio n’est pas envoyé à Flowear, seul le texte transcrit l’est.
        </p>
      </LegalSection>

      <LegalSection title="3. Pourquoi">
        <ul>
          <li>Faire fonctionner le service : répondre, se souvenir de toi, envoyer tes rappels (exécution du contrat).</li>
          <li>Te facturer et te donner accès à ce que tu as payé (exécution du contrat, obligations comptables).</li>
          <li>T’envoyer des notifications et un résumé par email, uniquement si tu les as activés (consentement, retirable à tout moment).</li>
          <li>Garder le service sain : limites par compte, protection contre les abus, correction des bugs (intérêt légitime).</li>
          <li>Comprendre ce qui aide vraiment, à partir de mesures agrégées (intérêt légitime).</li>
        </ul>
        <p>Nous ne vendons pas tes données et nous ne les utilisons pas pour de la publicité ciblée.</p>
      </LegalSection>

      <LegalSection title="4. L’intelligence artificielle">
        <p>
          Chaque réponse est produite par un modèle de langage hébergé par un fournisseur tiers. Pour répondre, nous lui envoyons ton message, une fenêtre récente de la conversation et un extrait de ce que l’IA a retenu de toi. Nos fournisseurs s’engagent contractuellement à ne pas entraîner leurs modèles sur ces échanges.
        </p>
        <p>
          Une IA peut se tromper. Ce qu’elle dit n’est ni un avis médical, ni juridique, ni financier. Si tu traverses un moment difficile, chaque IA sait te donner le numéro d’aide de ton pays, tenu à jour par nos soins et jamais inventé par le modèle.
        </p>
      </LegalSection>

      <LegalSection title="5. Qui y a accès">
        <p>Tes données sont traitées par les sous-traitants suivants, chacun pour une seule tâche :</p>
        <ul>
          {PROCESSORS.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> : {p.role}. Zone : {p.zone}.
            </li>
          ))}
        </ul>
        <p>
          Quand un sous-traitant est hors de l’Union européenne, le transfert s’appuie sur les clauses contractuelles types de la Commission européenne ou sur le Data Privacy Framework. L’éditeur peut lire tes conversations uniquement pour traiter un signalement que tu as fait ou pour corriger un bug, jamais par curiosité.
        </p>
      </LegalSection>

      <LegalSection title="6. Combien de temps">
        <ul>
          <li>Conversations, mémoire, tâches, rappels : tant que ton compte existe. Tu peux effacer chaque élément à tout moment.</li>
          <li>Compte supprimé : ton compte est désactivé immédiatement et l’ensemble de tes données est effacé dans un délai de trente jours.</li>
          <li>Factures et données de paiement : dix ans chez Stripe, durée légale en France.</li>
          <li>Mesures techniques agrégées : conservées sans lien avec ton identité.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Tes droits">
        <p>
          Tu peux à tout moment lire ta mémoire (page Mémoire de chaque IA), corriger ou effacer un élément, demander une copie de tes données, retirer ton consentement aux notifications et à l’email, et supprimer ton compte depuis les réglages de ton profil.
        </p>
        <p>
          Pour tout autre droit prévu par le RGPD (accès, rectification, effacement, limitation, portabilité, opposition), écris à <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>. Nous répondons sous un mois. Si tu n’es pas satisfait, tu peux saisir la CNIL (<a href="https://www.cnil.fr" rel="noreferrer">cnil.fr</a>).
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies et stockage local">
        <p>
          Flowear n’utilise pas de cookies publicitaires. Les seuls cookies sont ceux de la connexion (Clerk), strictement nécessaires. Ton navigateur garde localement quelques préférences (thème, langue, panneaux ouverts) et le brouillon en cours ; rien de tout ça ne quitte ton appareil.
        </p>
      </LegalSection>

      <LegalSection title="9. Mineurs">
        <p>Flowear s’adresse aux personnes de 16 ans et plus. Si tu as moins de 16 ans, demande l’accord d’un parent avant de créer un compte.</p>
      </LegalSection>

      <LegalSection title="10. Changements">
        <p>
          Si cette politique change de façon importante, nous te le dirons dans l’application avant que le changement s’applique. La date en haut de page indique la dernière révision. Les conditions d’utilisation sont sur une{' '}
          <Link href="/conditions">page dédiée</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
