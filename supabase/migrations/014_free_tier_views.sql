-- Mesures du gratuit permanent et de l'offre de bienvenue (18 septembre 2026).

-- Conversion dans la fenêtre de bienvenue : inscrits des 30 derniers jours, ceux qui ont pris
-- un abonnement Stripe dans les 72 h suivant leur inscription, et ceux qui ont consommé l'offre.
create or replace view welcome_conversion as
with recent as (
  select clerk_user_id, created_at, welcome_offer_used_at from users
  where deleted_at is null and created_at >= now() - interval '30 days'
)
select
  (select count(*) from recent) as signups_30d,
  (select count(*) from recent r where exists (
     select 1 from subscriptions s
     where s.user_id = r.clerk_user_id and s.stripe_subscription_id is not null
       and s.created_at <= r.created_at + interval '72 hours')) as converted_in_window,
  (select count(*) from recent r where exists (
     select 1 from subscriptions s
     where s.user_id = r.clerk_user_id and s.stripe_subscription_id is not null)) as converted_any,
  (select count(*) from recent where welcome_offer_used_at is not null) as offer_used;

-- Le gratuit, jour par jour (14 jours) : personnes actives qui n'ont jamais payé, ce qu'elles
-- coûtent en IA, et combien ont touché la limite de messages du jour.
create or replace view free_tier_day as
with payers as (
  select distinct user_id from subscriptions where stripe_subscription_id is not null
),
days as (
  select generate_series((now() at time zone 'utc')::date - 13, (now() at time zone 'utc')::date, interval '1 day')::date as day
)
select
  d.day,
  (select count(distinct u.user_id) from usage u
     where (u.created_at at time zone 'utc')::date = d.day and u.user_id not in (select user_id from payers)) as active_free,
  (select coalesce(sum(u.cost_usd), 0) from usage u
     where (u.created_at at time zone 'utc')::date = d.day and u.user_id not in (select user_id from payers)) as cost_free_usd,
  (select count(distinct e.user_id) from events e
     where e.name = 'quota_hit' and e.props->>'reason' = 'messages'
       and (e.created_at at time zone 'utc')::date = d.day) as limit_hit_users,
  (select count(*) from ad_rewards a where a.day = d.day and a.status = 'granted') as videos_granted
from days d
order by d.day;

revoke all on welcome_conversion, free_tier_day from anon, authenticated;
