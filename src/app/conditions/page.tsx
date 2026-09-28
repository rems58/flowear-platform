import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, publisherLine } from '@/components/legal/legal-page'
import { PRICES } from '@/core/billing/prices'
import { DEFAULTS } from '@/core/config/defaults'
import { PUBLISHER } from '@/core/legal/publisher'

export const metadata: Metadata = {
  title: 'Conditions d’utilisation · Flowear',
  description: 'Les règles simples pour utiliser Flowear : compte, plans, paiement, résiliation, limites de l’IA.',
}

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: PRICES.currency, maximumFractionDigits: 0 })

/**
 * Conditions d'utilisation, en français. Les montants et les quantités viennent du code
 * (`PRICES`, `DEFAULTS`) pour que la page ne mente jamais sur les réglages en vigueur.
 */
export default function TermsPage() {
  const free = DEFAULTS.plans.free
  const offer = DEFAULTS.offers.welcome
  return (
    <LegalPage
      eyebrow="Conditions d’utilisation"
      title="Les règles, en clair"
      intro="Utiliser Flowear, c’est accepter ces conditions. Elles sont courtes et écrites pour être lues."
    >
      <LegalSection title="1. Le service">
        <p>{publisherLine()}</p>
        <p>
          Flowear est un hub d’assistants conversationnels (« IA ») spécialisés, accessibles depuis <a href={PUBLISHER.site}>{PUBLISHER.site}</a> et installables comme application. Chaque IA retient ce que tu lui confies pour te répondre de façon personnelle.
        </p>
        <p>
          Certaines IA sont créées par des tiers, sous leur nom, avec la base de Flowear : Flowear les relit avant publication et reste ton seul interlocuteur ; le créateur n’a accès à aucune de tes données.
        </p>
      </LegalSection>

      <LegalSection title="2. Ton compte">
        <ul>
          <li>Il faut avoir 16 ans ou plus, et un compte par personne.</li>
          <li>Tu es responsable de ce qui se passe avec ton compte. Préviens-nous si tu penses qu’il est utilisé par quelqu’un d’autre.</li>
          <li>Tu peux supprimer ton compte à tout moment depuis les réglages de ton profil.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Plans et prix">
        <p>
          <strong>Gratuit</strong> : accès à chaque IA avec le même modèle que le plan payant, dans la limite de {free.messagesPerDay} messages par jour et {free.messagesPerMonth} par mois, {free.checkinsActive} rappel actif, {free.artifactsPerMonth} fiche par mois, sans recherche web. Ces quantités peuvent évoluer ; le nombre en vigueur est affiché sur la page Tarifs.
        </p>
        <p>
          <strong>Pro</strong> : {money.format(PRICES.app.monthly)} par mois ou {money.format(PRICES.app.yearly)} par an pour une IA ; {money.format(PRICES.bundle.monthly)} par mois ou {money.format(PRICES.bundle.yearly)} par an pour toutes les IA. L’annuel correspond à dix mois payés, deux offerts. Les prix sont en euros, toutes taxes comprises.
        </p>
        {offer.hours > 0 ? (
          <p>
            <strong>Offre de bienvenue</strong> : pendant les {offer.hours} heures qui suivent la création de ton compte, le premier mois est à {offer.percentOff} %. Elle s’applique une seule fois, sur un abonnement mensuel, et ne se cumule pas.
          </p>
        ) : null}
        <p>Nous pouvons ouvrir des promotions ponctuelles, toujours annoncées dans l’application.</p>
      </LegalSection>

      <LegalSection title="4. Paiement, renouvellement, résiliation">
        <ul>
          <li>Le paiement passe par Stripe, qui agit comme vendeur officiel (« merchant of record ») et émet les factures. Flowear ne voit jamais ton numéro de carte.</li>
          <li>L’abonnement se renouvelle automatiquement à chaque échéance, au tarif en vigueur, jusqu’à résiliation.</li>
          <li>Tu peux résilier en un clic depuis l’espace Abonnement. L’accès Pro reste ouvert jusqu’à la fin de la période déjà payée, puis ton compte repasse en gratuit sans perdre ta mémoire.</li>
          <li>
            Droit de rétractation : en démarrant l’abonnement, tu demandes l’accès immédiat au service et renonces au délai légal de quatorze jours. Il n’y a pas de remboursement au prorata, sauf si nous n’avons pas fourni le service.
          </li>
          <li>Si un prix change, tu en es prévenu au moins trente jours avant, et le nouveau prix ne s’applique qu’au renouvellement suivant.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Ce que l’IA n’est pas">
        <p>
          Les réponses sont générées par un modèle de langage et peuvent être fausses, incomplètes ou inadaptées à ta situation. Elles ne remplacent ni un médecin, ni un psychologue, ni un avocat, ni un conseiller financier. Une IA comme Amorce aide à démarrer ; elle ne diagnostique rien et ne prescrit rien.
        </p>
        <p>
          En cas d’urgence ou de détresse, contacte les services d’urgence de ton pays. Chaque IA peut te donner le numéro d’aide adapté à l’endroit où tu te trouves.
        </p>
      </LegalSection>

      <LegalSection title="6. Ce que tu t’engages à ne pas faire">
        <ul>
          <li>Utiliser Flowear pour nuire à quelqu’un, harceler, ou produire des contenus illégaux.</li>
          <li>Tenter de contourner les limites d’un plan, d’extraire les instructions internes d’une IA ou de perturber le service.</li>
          <li>Revendre l’accès, automatiser des requêtes en masse ou partager ton compte.</li>
        </ul>
        <p>En cas de manquement, nous pouvons suspendre ou fermer le compte, après t’avoir prévenu quand c’est possible.</p>
      </LegalSection>

      <LegalSection title="7. Tes contenus, nos contenus">
        <p>
          Ce que tu écris reste à toi. Tu nous autorises seulement à le traiter pour faire fonctionner le service, comme décrit dans la{' '}
          <Link href="/confidentialite">politique de confidentialité</Link>. Les réponses générées pour toi sont libres d’usage de ta part. Le nom Flowear, les noms des IA, leurs personnalités, l’interface et le code restent la propriété de l’éditeur.
        </p>
      </LegalSection>

      <LegalSection title="8. Disponibilité et responsabilité">
        <p>
          Nous faisons de notre mieux pour que le service soit disponible en permanence, sans le garantir : une maintenance, une panne d’un fournisseur ou un cas de force majeure peuvent l’interrompre. Notre responsabilité, quand elle est engagée, est limitée aux sommes que tu as payées au cours des douze derniers mois. Rien ici ne réduit les droits que la loi te garantit en tant que consommateur.
        </p>
      </LegalSection>

      <LegalSection title="9. Changements">
        <p>
          Nous pouvons faire évoluer ces conditions. En cas de changement important, tu en es informé dans l’application au moins trente jours avant ; continuer à utiliser Flowear après cette date vaut acceptation. Si tu n’es pas d’accord, tu peux résilier et supprimer ton compte.
        </p>
      </LegalSection>

      <LegalSection title="10. Droit applicable et litiges">
        <p>
          Ces conditions sont soumises au droit français. En cas de désaccord, écris-nous d’abord à <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a> : on cherche une solution. Sinon, tu peux recourir gratuitement à un médiateur de la consommation ou à la plateforme européenne de règlement en ligne des litiges (<a href="https://ec.europa.eu/consumers/odr" rel="noreferrer">ec.europa.eu/consumers/odr</a>), puis aux tribunaux compétents.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
