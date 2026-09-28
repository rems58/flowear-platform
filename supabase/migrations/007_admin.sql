-- Admin (phase 3) : signalements, visites, et les agrégats calculés par la base.
-- Les vues font le travail que le serveur ne doit pas faire en boucle sur les lignes :
-- elles restent justes à dix personnes comme à dix mille.

-- ------------------------------------------------------------
-- Signalements : ce qui ne va pas, dit par une personne ou détecté tout seul.
-- Le pouce bas veut dire « pas utile », un signalement veut dire « pas acceptable ».
-- ------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  -- Vide pour un signalement automatique (Stripe, alerte de coût, pic d'erreurs).
  user_id text,
  app_slug text,
  conversation_id uuid,
  message_id text,
  source text not null check (source in ('message', 'contact', 'system')),
  category text not null check (char_length(category) <= 40),
  severity text not null check (severity in ('low', 'medium', 'high')),
  body text check (body is null or char_length(body) <= 2000),
  status text not null default 'new' check (status in ('new', 'seen', 'resolved')),
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table reports enable row level security;
revoke all on reports from anon, authenticated;
create index if not exists reports_status_idx on reports (status, created_at desc);
create index if not exists reports_user_idx on reports (user_id, created_at desc);

-- ------------------------------------------------------------
-- Visites anonymes du hub (remplies au lot 2) : sans elles, l'entonnoir commence au compte.
-- Aucune adresse IP : une empreinte tournante, non réversible, suffit à dédoublonner.
-- ------------------------------------------------------------
create table if not exists visits (
  id bigserial primary key,
  day date not null default current_date,
  path text not null check (char_length(path) <= 200),
  utm jsonb,
  visitor_hash text not null,
  created_at timestamptz not null default now(),
  unique (day, path, visitor_hash)
);
alter table visits enable row level security;
revoke all on visits from anon, authenticated;

-- ------------------------------------------------------------
-- Lecture d'une conversation par l'admin : chaque ouverture laisse une trace.
-- (aucune colonne à ajouter, `audit_logs` porte déjà action, user_id, details)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Vues. Toutes en UTC, comme les quotas.
-- ------------------------------------------------------------

-- Une ligne : les grands chiffres de la vue d'ensemble.
create or replace view admin_overview as
select
  (select count(*) from users where deleted_at is null) as users_total,
  (select count(*) from users where deleted_at is null and created_at >= date_trunc('day', now())) as signups_today,
  (select count(*) from users where deleted_at is null and created_at >= now() - interval '7 days') as signups_week,
  (select count(*) from users where deleted_at is null and created_at >= now() - interval '30 days') as signups_month,
  (select count(distinct user_id) from usage where created_at >= date_trunc('day', now())) as active_today,
  (select count(distinct user_id) from usage where created_at >= now() - interval '7 days') as active_week,
  (select count(distinct user_id) from usage where created_at >= now() - interval '30 days') as active_month,
  (select count(*) from usage where created_at >= date_trunc('day', now())) as messages_today,
  (select count(*) from usage where created_at >= now() - interval '7 days') as messages_week,
  (select coalesce(sum(cost_usd), 0) from usage where created_at >= date_trunc('day', now())) as cost_today_usd,
  (select coalesce(sum(cost_usd), 0) from usage where created_at >= date_trunc('month', now())) as cost_month_usd,
  -- Des personnes, pas des lignes : quelqu'un qui a une IA et le bundle compte une fois, comme dans l'entonnoir.
  (select count(distinct user_id) from subscriptions where status in ('active', 'past_due') and stripe_subscription_id is not null) as subscribers,
  (select count(distinct user_id) from subscriptions where status = 'trialing' and stripe_subscription_id is null and current_period_end > now()) as in_trial,
  (select count(*) from reports where status = 'new') as reports_new;

-- Par jour et par IA : qui a écrit, combien ça a coûté, en combien de temps.
create or replace view daily_activity as
select
  date_trunc('day', created_at)::date as day,
  app_slug,
  count(distinct user_id) as active_users,
  count(*) as messages,
  coalesce(sum(cost_usd), 0) as cost_usd,
  percentile_cont(0.5) within group (order by duration_ms) as latency_p50_ms,
  percentile_cont(0.95) within group (order by duration_ms) as latency_p95_ms
from usage
group by 1, 2;

-- Cohortes par semaine d'inscription. J1, J7, J30 = a écrit au moins une fois dans la
-- fenêtre [J, 2J) après son inscription, ce qui reste comparable d'une cohorte à l'autre.
-- `eligible_*` dit si la cohorte est assez ancienne pour que la colonne ait un sens.
create or replace view signup_cohorts as
with base as (
  select u.clerk_user_id as user_id, date_trunc('week', u.created_at) as week, u.created_at
  from users u
  where u.deleted_at is null
),
windows as (
  select
    b.week,
    b.user_id,
    exists (select 1 from usage x where x.user_id = b.user_id and x.created_at >= b.created_at + interval '1 day' and x.created_at < b.created_at + interval '2 days') as d1,
    exists (select 1 from usage x where x.user_id = b.user_id and x.created_at >= b.created_at + interval '7 days' and x.created_at < b.created_at + interval '14 days') as d7,
    exists (select 1 from usage x where x.user_id = b.user_id and x.created_at >= b.created_at + interval '30 days' and x.created_at < b.created_at + interval '60 days') as d30,
    b.created_at
  from base b
)
select
  week::date as week,
  count(*) as signups,
  count(*) filter (where d1) as d1,
  count(*) filter (where d7) as d7,
  count(*) filter (where d30) as d30,
  bool_and(created_at + interval '2 days' <= now()) as eligible_d1,
  bool_and(created_at + interval '14 days' <= now()) as eligible_d7,
  bool_and(created_at + interval '60 days' <= now()) as eligible_d30
from windows
group by week
order by week desc;

-- Même chose par IA, l'inscription étant l'onboarding terminé sur cette IA.
create or replace view app_cohorts as
with base as (
  select p.user_id, p.app_slug, date_trunc('week', p.created_at) as week, p.created_at
  from profiles p
  where p.status = 'active'
),
windows as (
  select
    b.app_slug,
    b.week,
    exists (select 1 from usage x where x.user_id = b.user_id and x.app_slug = b.app_slug and x.created_at >= b.created_at + interval '1 day' and x.created_at < b.created_at + interval '2 days') as d1,
    exists (select 1 from usage x where x.user_id = b.user_id and x.app_slug = b.app_slug and x.created_at >= b.created_at + interval '7 days' and x.created_at < b.created_at + interval '14 days') as d7,
    exists (select 1 from usage x where x.user_id = b.user_id and x.app_slug = b.app_slug and x.created_at >= b.created_at + interval '30 days' and x.created_at < b.created_at + interval '60 days') as d30,
    b.created_at
  from base b
)
select
  app_slug,
  week::date as week,
  count(*) as signups,
  count(*) filter (where d1) as d1,
  count(*) filter (where d7) as d7,
  count(*) filter (where d30) as d30,
  bool_and(created_at + interval '2 days' <= now()) as eligible_d1,
  bool_and(created_at + interval '14 days' <= now()) as eligible_d7,
  bool_and(created_at + interval '60 days' <= now()) as eligible_d30
from windows
group by app_slug, week
order by week desc;

-- Entonnoir, une ligne par IA plus une ligne « flowear » pour l'ensemble.
create or replace view funnel as
with per_user as (
  select user_id, app_slug, count(*) as messages
  from usage
  group by user_id, app_slug
)
select
  p.app_slug,
  (select count(distinct user_id) from profiles where app_slug = p.app_slug) as started,
  (select count(*) from profiles where app_slug = p.app_slug and status = 'active') as onboarded,
  (select count(*) from per_user where app_slug = p.app_slug) as first_message,
  (select count(*) from per_user where app_slug = p.app_slug and messages >= 3) as three_messages,
  (select count(*) from subscriptions where app_slug = p.app_slug and stripe_subscription_id is not null and status in ('active', 'past_due')) as subscribed
from (select distinct app_slug from profiles) p
union all
select
  'flowear' as app_slug,
  (select count(*) from users where deleted_at is null) as started,
  (select count(distinct user_id) from profiles where status = 'active') as onboarded,
  (select count(distinct user_id) from usage) as first_message,
  (select count(*) from (select user_id from usage group by user_id having count(*) >= 3) t) as three_messages,
  (select count(distinct user_id) from subscriptions where stripe_subscription_id is not null and status in ('active', 'past_due')) as subscribed;

-- Qualité et santé par IA : ce que les gens en disent, et ce qui casse.
create or replace view app_quality as
select
  a.app_slug,
  (select count(*) from messages m where m.app_slug = a.app_slug and m.role = 'assistant') as answers,
  (select count(*) from messages m where m.app_slug = a.app_slug and m.feedback = 'up') as thumbs_up,
  (select count(*) from messages m where m.app_slug = a.app_slug and m.feedback = 'down') as thumbs_down,
  (select count(*) from messages m where m.app_slug = a.app_slug and m.generic = true) as generic_answers,
  (select count(*) from events e where e.app_slug = a.app_slug and e.name = 'tool_called') as tool_called,
  (select count(*) from events e where e.app_slug = a.app_slug and e.name = 'tool_failed') as tool_failed,
  (select count(*) from events e where e.app_slug = a.app_slug and e.name = 'provider_fallback') as fallbacks,
  (select count(*) from events e where e.app_slug = a.app_slug and e.name = 'quota_hit') as quota_hits,
  (select count(*) from reports r where r.app_slug = a.app_slug and r.status <> 'resolved') as open_reports
from (select distinct app_slug from usage union select distinct app_slug from profiles) a;

-- Une ligne par conversation : ce que la fiche personne montre avant d'ouvrir le contenu.
create or replace view conversation_stats as
select
  c.id as conversation_id,
  c.user_id,
  c.app_slug,
  c.title,
  c.created_at,
  c.updated_at,
  count(m.id) as messages,
  count(m.id) filter (where m.feedback = 'up') as thumbs_up,
  count(m.id) filter (where m.feedback = 'down') as thumbs_down,
  count(m.id) filter (where m.generic = true) as generic_answers
from conversations c
left join messages m on m.conversation_id = c.id
group by c.id;

-- Les vues héritent des droits par défaut : rien pour anon et authenticated.
revoke all on admin_overview, daily_activity, signup_cohorts, app_cohorts, funnel, app_quality, conversation_stats from anon, authenticated;
