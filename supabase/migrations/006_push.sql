-- Notifications push (phase 2).
-- Une ligne = un navigateur qui veut les notifications d'une IA. L'endpoint est fourni par
-- le service de push du navigateur (Apple, Google, Mozilla) : il identifie le navigateur.
-- Il n'est pas unique à lui seul : le service worker est posé une fois pour tout le site,
-- donc un même navigateur porte le même endpoint pour Rémy, pour Teinty et pour les
-- suivantes. C'est le couple (endpoint, IA) qui est unique.
-- Les clés p256dh et auth chiffrent le contenu de bout en bout : le service de push
-- transporte sans pouvoir lire. Elles ne valent rien sans l'endpoint, mais restent des
-- secrets : accès par la clé service uniquement, comme le reste.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- Langue au moment de l'abonnement : la notification part dans cette langue, sans lire le profil.
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  -- Dernier passage de la relance hebdomadaire, qu'elle ait été envoyée ou écartée
  -- (personne encore active, rien à rappeler) : sert à espacer et à faire tourner le lot.
  last_nudged_at timestamptz,
  unique (endpoint, app_slug)
);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- Lecture par personne et par IA (état du bouton, envoi ciblé).
create index if not exists push_subscriptions_user_app_idx on push_subscriptions (user_id, app_slug);
-- Sélection des relances : les plus anciennement servies d'abord, jamais servies en tête.
create index if not exists push_subscriptions_last_nudged_idx on push_subscriptions (last_nudged_at nulls first);
