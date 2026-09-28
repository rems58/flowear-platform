-- Affiliation créateurs : un code par créateur, un lien `?ref=<code>`, une commission par abonné
-- payant après trente jours. Les inscriptions et paiements se lisent dans `events`
-- (onboarding_done avec utm->>'ref', puis subscribed) : aucune autre table.
create table if not exists affiliates (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name text not null check (char_length(name) <= 80),
  contact text check (char_length(contact) <= 120),
  payout_eur numeric(6, 2) not null default 9,
  created_at timestamptz not null default now()
);
alter table affiliates enable row level security;
revoke all on affiliates from anon, authenticated;
-- Lecture des inscriptions par code, sans parcourir toute la table.
create index if not exists events_ref_idx on events ((utm->>'ref')) where name = 'onboarding_done' and utm->>'ref' is not null;
