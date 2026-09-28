-- Pub récompensée : « regarde une vidéo, gagne des messages ». Une ligne par vidéo lancée ;
-- `granted` quand la régie a confirmé. Les messages gagnés s'ajoutent au quota du jour.
create table if not exists ad_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  day date not null,
  nonce text not null unique,
  status text not null default 'pending' check (status in ('pending', 'granted')),
  messages smallint not null default 0,
  created_at timestamptz not null default now(),
  granted_at timestamptz
);
alter table ad_rewards enable row level security;
revoke all on ad_rewards from anon, authenticated;
create index if not exists ad_rewards_user_day_idx on ad_rewards (user_id, app_slug, day);
