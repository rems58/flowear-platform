-- Flowear Studio en libre-service (23/09/2026), étape A : les IA des créateurs vivent en base.
-- Le brouillon (`manifest`, `knowledge`) et la version en ligne (`published_*`) sont séparés :
-- un créateur peut modifier sans rien changer pour ses utilisateurs tant que Rémy n'a pas revu.
create table if not exists creator_apps (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,32}$'),
  owner_id text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_review', 'changes_requested', 'published', 'suspended')),
  manifest jsonb not null,
  knowledge jsonb not null default '[]'::jsonb,
  version int not null default 1,
  published_manifest jsonb,
  published_knowledge jsonb,
  review_notes text check (char_length(review_notes) <= 2000),
  reviewed_by text,
  reviewed_at timestamptz,
  terms_accepted_at timestamptz,
  share_percent numeric(5,2) not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  published_at timestamptz
);
create index if not exists creator_apps_owner_idx on creator_apps (owner_id);
create index if not exists creator_apps_status_idx on creator_apps (status);

create table if not exists creator_app_checks (
  id uuid primary key default gen_random_uuid(),
  slug text not null references creator_apps (slug) on delete cascade,
  version int not null,
  "check" text not null,
  ok boolean not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists creator_app_checks_slug_idx on creator_app_checks (slug, version);

create table if not exists creator_tool_requests (
  id uuid primary key default gen_random_uuid(),
  slug text not null references creator_apps (slug) on delete cascade,
  owner_id text not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 2000),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);

create table if not exists creator_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  actor_id text,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists creator_events_slug_idx on creator_events (slug, created_at desc);

alter table users add column if not exists creator boolean not null default false;

alter table creator_apps enable row level security;
alter table creator_app_checks enable row level security;
alter table creator_tool_requests enable row level security;
alter table creator_events enable row level security;
revoke all on creator_apps, creator_app_checks, creator_tool_requests, creator_events from anon, authenticated;
