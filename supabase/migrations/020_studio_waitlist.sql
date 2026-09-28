-- Flowear Studio (22/09/2026) : liste d'attente publique des créateurs. Un email, une idée,
-- une audience, l'origine. L'entrée réelle se fait par promo, à la main, depuis l'admin.
create table if not exists studio_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 200),
  idea text not null check (char_length(idea) <= 300),
  audience text check (char_length(audience) <= 120),
  locale text not null,
  utm jsonb,
  created_at timestamptz not null default now()
);
alter table studio_waitlist enable row level security;
revoke all on studio_waitlist from anon, authenticated;
