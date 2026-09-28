-- Créateurs (24/09/2026) : versements enregistrés par Rémy, et lien de statistiques partagé.
-- Le lien porte un jeton aléatoire ; seule son empreinte SHA-256 est gardée ici.
create table if not exists creator_payouts (
  id uuid primary key default gen_random_uuid(),
  slug text not null references creator_apps (slug) on delete cascade,
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  paid_at date not null,
  note text check (char_length(note) <= 300),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists creator_payouts_slug_idx on creator_payouts (slug, paid_at desc);
alter table creator_payouts enable row level security;
revoke all on creator_payouts from anon, authenticated;

alter table creator_apps add column if not exists share_token_hash text unique check (share_token_hash ~ '^[0-9a-f]{64}$');
alter table creator_apps add column if not exists share_token_created_at timestamptz;
