-- Semaine d'accueil et digest hebdomadaire.
-- La semaine d'accueil est une ligne `subscriptions` en statut trialing sans identifiants Stripe.
-- Le digest est envoyé par email une fois par semaine ; désactivable par un lien dans l'email.
alter table users add column if not exists digest_enabled boolean not null default true;
alter table users add column if not exists last_digest_at timestamptz;
create index if not exists users_digest_idx on users (digest_enabled, last_digest_at) where deleted_at is null and email is not null;
create index if not exists subscriptions_user_app_idx on subscriptions (user_id, app_slug);
create index if not exists artifacts_user_app_created_idx on artifacts (user_id, app_slug, created_at desc);
create index if not exists memory_notes_user_app_created_idx on memory_notes (user_id, app_slug, created_at desc);
