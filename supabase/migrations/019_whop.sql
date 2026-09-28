-- Whop, deuxième caisse (21/09/2026) : une adhésion Whop = une ligne `subscriptions` identifiée par
-- `whop_membership_id`. `whop_memberships` garde chaque webhook reçu, rattaché à une personne par
-- son email, ou en attente jusqu'à l'inscription.
alter table subscriptions add column if not exists whop_membership_id text unique;

create table if not exists whop_memberships (
  membership_id text primary key,
  whop_user_id text,
  email text,
  product_id text,
  plan_id text,
  status text not null,
  renewal_period_end timestamptz,
  app_slug text not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whop_memberships_email_idx on whop_memberships (lower(email)) where user_id is null;
alter table whop_memberships enable row level security;
revoke all on whop_memberships from anon, authenticated;
