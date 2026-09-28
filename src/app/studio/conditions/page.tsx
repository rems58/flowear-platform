import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, publisherLine } from '@/components/legal/legal-page'
import { PUBLISHER } from '@/core/legal/publisher'
import { STUDIO_TERMS_VERSION } from '@/core/studio/draft'
import { CREATOR_FREE_MESSAGES_PER_DAY, STUDIO_SHARE_PERCENT } from '@/core/studio/waitlist'

export const metadata: Metadata = {
  title: 'Conditions Flowear Studio · Flowear',
  description: 'Les règles entre Flowear et les créateurs qui publient une IA sur flowear.app : propriété, partage du revenu, revue, suspension.',
}

/**
 * Conditions Studio, en français, comme les autres pages légales. La version datée vient du code
 * (`STUDIO_TERMS_VERSION`) : c'est elle que le créateur accepte à la soumission, et une nouvelle
 * version redemande l'acceptation.
 */
export default function StudioTermsPage() {
  return (
    <LegalPage eyebrow={`Conditions Flowear Studio · version du ${STUDIO_TERMS_VERSION}`} title="Créer une IA sur Flowear" intro="Ce que Flowear s’engage à faire pour toi, ce que tu t’engages à faire, et comment on partage. Court, écrit pour être lu, accepté à chaque soumission.">
      <LegalSection title="1. Qui contracte">
        <p>{publisherLine()}</p>
        <p>
          Toi, le créateur : une personne majeure, avec un compte Flowear, à qui l’accès au Studio a été ouvert. Pour toucher un partage de revenu, tu dois avoir un statut qui permet de facturer (micro-entreprise ou équivalent dans ton pays) ; sans statut, ton IA peut être publiée mais le partage est mis en réserve jusqu’à ce que tu en aies un.
        </p>
      </LegalSection>

      <LegalSection title="2. Ce que tu apportes, et ce qui reste à toi">
        <ul>
          <li>Tu restes propriétaire de tes textes (persona, questions, suggestions) et de tes connaissances.</li>
          <li>Tu accordes à Flowear une licence non exclusive, gratuite, pour les exécuter, les afficher, les traduire et les adapter sur flowear.app et ses applications, tant que ton IA est publiée, et le temps de servir les abonnés en cours après son retrait.</li>
          <li>Tu certifies avoir le droit d’utiliser tout ce que tu fournis : rien de copié sans autorisation, aucun contenu qui viole un droit ou une loi.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Ce qui reste à Flowear">
        <ul>
          <li>La base (le code, les outils, la mémoire, l’interface, les modèles choisis), la marque Flowear et le site restent la propriété de Flowear. Rien ne t’est cédé : aucun code, aucun accès aux données, aucun droit de reproduction.</li>
          <li>Le nom de ton IA est présenté « par Flowear ». Tu ne déposes pas ce nom comme marque pour des services logiciels ou d’IA sans accord écrit.</li>
          <li>Tu n’as accès à aucune donnée personnelle des personnes qui utilisent ton IA. Tu vois des chiffres agrégés seulement. Flowear reste responsable du traitement.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. La revue">
        <ul>
          <li>Rien n’est publié sans relecture par Flowear : vérifications automatiques à la soumission, scénario de test, puis lecture humaine avec une liste de contrôle. Flowear peut demander des changements, refuser, ou publier.</li>
          <li>Pendant la revue, ton brouillon est figé. Après publication, tu peux le modifier ; chaque nouvelle version repasse par la revue.</li>
          <li>Flowear décide seul de ce qui est publié, sans avoir à se justifier au-delà d’un motif en une ligne.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Le partage du revenu">
        <ul>
          <li>Tu touches {STUDIO_SHARE_PERCENT} % du revenu net de chaque abonnement à ton IA, que tu l’aies construite toi-même ou que Flowear l’ait construite avec toi. Le pourcentage est écrit dans ton espace.</li>
          <li>Revenu net = ce que Flowear encaisse réellement pour ton IA, après frais de paiement, taxes, remboursements et coût d’IA de tes abonnés. Les gratuits ({CREATOR_FREE_MESSAGES_PER_DAY} messages par jour) ne rapportent rien ; Flowear paie leur IA.</li>
          <li>Versement mensuel, à partir de 20 € cumulés, 30 jours après l’encaissement (le temps des remboursements), sur facture de ta part ou relevé émis par Flowear selon ton statut.</li>
          <li>Un abonnement à l’offre groupée (plusieurs IA) est réparti au prorata de l’usage réel entre les IA concernées.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Ce que tu ne fais pas">
        <ul>
          <li>Pas de promesse médicale, financière ou de résultat : ton IA n’établit pas de diagnostic, ne prescrit rien, ne garantit aucun gain.</li>
          <li>Pas de contenu illégal, haineux, sexuel, ni de données personnelles de tiers dans tes connaissances.</li>
          <li>Pas de contournement des plafonds, des outils ou des vérifications ; pas de plusieurs comptes ; pas de trafic artificiel pour gonfler tes chiffres.</li>
          <li>Pas de communication au nom de Flowear : tu parles de ton IA, « sur Flowear », avec tes mots.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Suspension et retrait">
        <ul>
          <li>Flowear peut suspendre ton IA à tout moment pour sécurité, plainte, non-respect de ces conditions ou décision de justice, avec un motif. Elle disparaît du hub ; les abonnés en cours sont servis jusqu’à la fin de leur période.</li>
          <li>Tu peux retirer ton IA avec 30 jours de préavis, par email à <a href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</a>. Le partage dû te reste acquis.</li>
          <li>Si Flowear arrête le service, les créateurs sont prévenus 30 jours avant et payés jusqu’au dernier jour.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Responsabilités">
        <p>
          Tu réponds du contenu que tu fournis et de ce que tu dis de ton IA à ton audience. Flowear répond de la plateforme, de la sécurité et de la relation avec les personnes qui l’utilisent. Chacun garantit l’autre contre les réclamations qui viennent de sa part. La responsabilité de Flowear envers toi est limitée aux sommes qui te sont dues au titre du partage.
        </p>
      </LegalSection>

      <LegalSection title="9. Le reste">
        <ul>
          <li>Ces conditions sont régies par le droit français. En cas de désaccord, on commence par en parler ; sinon, les tribunaux français sont compétents.</li>
          <li>Flowear peut faire évoluer ces conditions ; une nouvelle version datée te sera demandée à ta prochaine soumission, et signalée par email si elle touche au partage.</li>
          <li>Les <Link href="/conditions">conditions d’utilisation</Link> et la <Link href="/confidentialite">politique de confidentialité</Link> de Flowear s’appliquent aussi à toi comme utilisateur.</li>
        </ul>
      </LegalSection>
    </LegalPage>
  )
}
