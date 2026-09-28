-- Admin, lot 2 : actions sur un compte, revenu, attribution.

-- ------------------------------------------------------------
-- Testeur décidé depuis l'admin. La variable TESTER_CLERK_USER_IDS reste un amorçage :
-- la base et la variable se cumulent, ni l'une ni l'autre ne retire l'autre.
-- ------------------------------------------------------------
alter table users add column if not exists tester boolean not null default false;

-- Remise à zéro d'un quota : l'usage antérieur à cette date ne compte plus contre les
-- plafonds. Les lignes `usage` restent, c'est de la comptabilité, pas du quota.
alter table users add column if not exists quota_reset_at timestamptz;

-- Périodicité, posée par le webhook Stripe : sans elle, impossible de calculer un revenu
-- mensuel depuis un identifiant de prix.
alter table subscriptions add column if not exists interval text check (interval is null or interval in ('month', 'year'));

-- Un mois offert est une ligne `active` sans Stripe. L'index d'unicité ne doit plus
-- bloquer qu'une seconde semaine d'accueil, pas un cadeau à côté d'elle.
drop index if exists subscriptions_trial_unique;
create unique index if not exists subscriptions_trial_unique on subscriptions (user_id, app_slug) where stripe_subscription_id is null and status = 'trialing';
-- Et un seul cadeau en cours par personne et par IA : deux clics simultanés n'en font pas deux.
create unique index if not exists subscriptions_gift_unique on subscriptions (user_id, app_slug) where stripe_subscription_id is null and status = 'active';

-- ------------------------------------------------------------
-- Vues du revenu. Le montant vient du code (grille des prix), la base ne connaît que la
-- périodicité et l'IA : elle compte, le serveur multiplie.
-- ------------------------------------------------------------

-- Abonnements Stripe en cours, ce qu'il faut pour un revenu mensuel.
create or replace view paid_subscriptions as
select user_id, app_slug, interval, status, created_at
from subscriptions
where stripe_subscription_id is not null and status in ('active', 'past_due');

-- Conversion de la semaine d'accueil : personnes dont la semaine est finie, et parmi elles
-- celles qui ont pris un abonnement Stripe, à n'importe quel moment.
create or replace view trial_conversion as
with ended as (
  select distinct user_id from subscriptions
  where stripe_subscription_id is null and status = 'trialing' and current_period_end < now()
)
select
  (select count(*) from ended) as trials_ended,
  (select count(*) from ended e where exists (select 1 from subscriptions s where s.user_id = e.user_id and s.stripe_subscription_id is not null)) as converted;

-- Attrition du mois : parmi les abonnés qu'on avait au 1er, ceux qui sont partis depuis,
-- sans garder un autre abonnement ouvert. Quelqu'un qui lâche une IA mais garde le bundle
-- paie toujours : il ne compte pas. Un abonné arrivé et reparti dans le mois n'était pas
-- là au 1er : il ne compte pas non plus, sinon le taux dépasserait cent pour cent.
create or replace view churn_month as
with at_start as (
  select distinct user_id from subscriptions
  where stripe_subscription_id is not null and created_at < date_trunc('month', now())
    and (status in ('active', 'past_due') or updated_at >= date_trunc('month', now()))
),
still_paying as (
  select distinct user_id from subscriptions
  where stripe_subscription_id is not null and status in ('active', 'past_due')
)
select
  (select count(*) from at_start a where a.user_id not in (select user_id from still_paying)) as churned,
  (select count(*) from at_start) as at_month_start;

-- Actifs des sept derniers jours, par IA : des personnes distinctes sur la période, pas
-- le pic d'une journée.
create or replace view weekly_active as
select app_slug, count(distinct user_id) as active_users
from usage
where created_at >= now() - interval '7 days'
group by app_slug;

-- Attribution : d'où viennent les onboardings terminés, par source et campagne UTM.
create or replace view attribution as
select
  coalesce(utm->>'source', 'direct') as source,
  coalesce(utm->>'campaign', '') as campaign,
  count(*) as onboardings
from events
where name = 'onboarding_done'
group by 1, 2
order by 3 desc;

-- Visites par jour, et visiteurs distincts (empreintes tournantes, jamais d'adresse).
create or replace view daily_visits as
select day, count(*) as visits, count(distinct visitor_hash) as visitors
from visits
group by day;

revoke all on paid_subscriptions, trial_conversion, churn_month, attribution, daily_visits, weekly_active from anon, authenticated;
