# Flowear

**Plateforme SaaS multi-tenant d'assistants IA spécialisés.** Un seul déploiement Next.js
sert plusieurs IA verticales, chacune sur son chemin (`flowear.app/<slug>`), avec abonnement,
mémoire persistante, outils et panel d'administration. Des créateurs externes peuvent publier
leur propre IA en libre-service.

🔗 **En production : [flowear.app](https://flowear.app)**

> Dépôt vitrine : copie du code de production, sans la documentation interne (stratégie,
> exploitation). Conçu, développé et mis en production seul.

## En chiffres

| | |
|---|---|
| Code | ~35 000 lignes TypeScript / SQL |
| Tests | 324 cas Vitest sur 49 fichiers |
| Langues | 5 (en, fr, es, de, it), parité des clés vérifiée par les tests |
| Base de données | 24 migrations Supabase, RLS |

## Stack

**Front** : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, PWA
(service worker, web push VAPID)
**Back** : routes API Next.js, Supabase (Postgres + RLS), Clerk (auth + webhooks),
Stripe (abonnements + webhooks signés), Upstash Redis (rate limiting), Resend
**IA** : Vercel AI SDK, streaming SSE, chaîne de repli multi-fournisseurs
Groq → OpenAI → Mistral → Google
**Qualité** : Vitest, ESLint, validation Zod de toutes les entrées et variables d'environnement

## Ce qui est intéressant techniquement

**Architecture pilotée par manifeste.** Une IA = un fichier `src/apps/<slug>/manifest.ts`
(persona, onboarding, outils, plans, langues). Aucune logique métier ailleurs pour la
différencier : une nouvelle IA se crée sans toucher au cœur.

**Configuration en trois couches.** `resolveConfig(slug)` fusionne les valeurs globales, le
manifeste et les réglages admin en base (appliqués à chaud, à toutes les IA ou à une sélection).

**Contrat d'outil unique.** `defineTool()` : schéma Zod d'entrée, niveau de coût, TTL de cache,
plan requis, type de rendu. Ajouter un outil = un fichier + une ligne de registre. Les sorties
d'outils sont traitées comme données non fiables dans le prompt.

**Boucle agent en streaming** avec budget d'étapes, repli automatique entre fournisseurs et
garde-fou de coût par utilisateur et par jour.

**Registre à deux sources.** Les IA du code et les IA publiées par des créateurs (chargées depuis
Postgres, cache 60 s) partagent le même registre. Un manifeste créateur est assaini à chaque
étape : liste blanche d'outils, slugs réservés, plans imposés.

**Studio créateurs** : brouillon → vérifications automatiques → scénario en bac à sable →
soumission → file de revue admin → publication. Tableau de bord créateur en agrégats,
partage de revenus calculé côté serveur.

**Sécurité par défaut** : chaque route API passe par `requireAuth`, rate limit, validation Zod
et contrôle de propriété ; chaque requête filtrée par `user_id` + `app_id`, RLS en seconde ligne.
L'historique de conversation est reconstruit depuis la base, jamais rejoué depuis le client.
Le serveur refuse de démarrer avec des clés `live` hors de l'environnement de production.

## Fonctionnalités

- Chat IA en streaming, onboarding personnalisé, mémoire persistante (profil, souvenirs)
- Base de connaissances Markdown par IA, dictée vocale
- Abonnements Stripe par IA ou bundle, quotas gratuits, période d'essai
- Admin : cohortes, personnes et dépenses, réglages à chaud, revue des IA créateurs,
  revenus et versements créateurs
- Affiliation, statistiques partagées par lien signé
- PWA installable par IA (icônes générées depuis la marque), notifications push
- Pages légales, purge automatique des données à 30 jours

## Structure

```
src/
  app/          routes Next.js : hub, [app] (chat d'une IA), admin, studio, api/
  apps/         une IA = un manifeste (+ connaissances et outils propres)
  core/         logique métier pure et testable : agent, tools, memory, billing, studio...
  lib/          intégrations : db, auth, stripe, push, i18n, env
supabase/       migrations SQL
tests/          Vitest
```

Détails : [`docs/03-architecture.md`](docs/03-architecture.md) ·
recette de création d'une IA : [`docs/08-entrainer-une-ia.md`](docs/08-entrainer-une-ia.md)

## Lancer en local

```bash
cp .env.example .env.local   # clés Supabase, Clerk, Stripe, Groq...
npm install
npm run dev                  # http://localhost:3030
npm test                     # 324 tests
```

## Auteur

**Rémy Magne**, développeur full stack · [GitHub](https://github.com/rems58)
