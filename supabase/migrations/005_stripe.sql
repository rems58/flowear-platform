-- Stripe : identifiant client par personne, idempotence des événements, unicité de la semaine d'accueil.

-- Un client Stripe par personne, réutilisé pour tous ses abonnements (une IA, le bundle).
alter table users add column if not exists stripe_customer_id text;
create unique index if not exists users_stripe_customer_idx on users (stripe_customer_id) where stripe_customer_id is not null;

-- Un événement Stripe n'est traité qu'une fois, même si Stripe le rejoue.
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
revoke all on stripe_events from anon, authenticated;

-- La semaine d'accueil est la seule ligne sans abonnement Stripe : au plus une par personne et par IA.
-- Ferme la course de deux onboardings simultanés (relevé par la revue du 16 septembre 2026).
create unique index if not exists subscriptions_trial_unique on subscriptions (user_id, app_slug) where stripe_subscription_id is null;

-- Recherche par client Stripe lors des webhooks.
create index if not exists subscriptions_stripe_customer_idx on subscriptions (stripe_customer_id);
