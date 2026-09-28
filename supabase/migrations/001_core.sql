-- ============================================================
-- Flowear : socle de données (phase 1)
-- Tables partagées entre toutes les IA, discriminées par app_slug.
-- Accès uniquement par la clé service côté serveur. RLS activée sans
-- politique permissive : les rôles anon et authenticated ne voient rien.
-- ============================================================

create extension if not exists pgcrypto;

-- Utilisateurs (miroir Clerk, id texte = clerk_user_id)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text,
  locale text not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Profil par utilisateur et par IA : réponses d'onboarding + ce que l'IA retient
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'onboarding' check (status in ('onboarding', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app_slug)
);
create index if not exists profiles_user_app_idx on profiles (user_id, app_slug);

-- Notes de mémoire libres (écrites par le modèle via save_note)
create table if not exists memory_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  content text not null check (char_length(content) <= 600),
  created_at timestamptz not null default now()
);
create index if not exists memory_notes_user_app_idx on memory_notes (user_id, app_slug, created_at desc);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_app_idx on conversations (user_id, app_slug, updated_at desc);

-- Messages au format UIMessage (parts jsonb), id fourni par le client ou généré
create table if not exists messages (
  id text primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id text not null,
  app_slug text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null default '[]'::jsonb,
  generic boolean,
  feedback text check (feedback in ('up', 'down')),
  feedback_reason text check (feedback_reason is null or char_length(feedback_reason) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists messages_user_idx on messages (user_id, app_slug, created_at desc);

-- Artefacts : fiches, comparatifs. public_slug posé en phase 5 (pages partageables)
create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  conversation_id uuid references conversations (id) on delete set null,
  type text not null check (type in ('fiche', 'comparatif')),
  title text not null,
  data jsonb not null default '{}'::jsonb,
  public_slug text unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists artifacts_user_app_idx on artifacts (user_id, app_slug, created_at desc);

-- Événements produit (cohortes, entonnoir, attribution UTM)
create table if not exists events (
  id bigserial primary key,
  user_id text,
  app_slug text,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  utm jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_idx on events (name, created_at desc);
create index if not exists events_app_idx on events (app_slug, created_at desc);
create index if not exists events_user_idx on events (user_id, created_at desc);

-- Usage IA : une ligne par réponse (quota du jour, coût, fallback)
create table if not exists usage (
  id bigserial primary key,
  user_id text not null,
  app_slug text not null,
  conversation_id uuid,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_user_app_day_idx on usage (user_id, app_slug, created_at desc);

-- Abonnements Stripe (remplis en phase 4). app_slug = 'flowear' pour le bundle
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions (user_id, status);

-- Réglages à chaud (troisième couche de config). scope = {'all'} ou liste de slugs
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  scope text[] not null default '{all}',
  key text not null,
  value jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Journal d'audit : auth refusée, rate limit, actions admin, erreurs API
create table if not exists audit_logs (
  id bigserial primary key,
  user_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_action_idx on audit_logs (action, created_at desc);

-- ------------------------------------------------------------
-- Sécurité : RLS activée partout, aucune politique permissive.
-- Le rôle service_role contourne la RLS ; anon et authenticated n'ont aucun droit.
-- ------------------------------------------------------------
alter table users enable row level security;
alter table profiles enable row level security;
alter table memory_notes enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table artifacts enable row level security;
alter table events enable row level security;
alter table usage enable row level security;
alter table subscriptions enable row level security;
alter table app_settings enable row level security;
alter table audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- Les tables des migrations suivantes naissent sans droit pour anon et authenticated.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
