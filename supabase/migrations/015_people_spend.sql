-- Dépense IA par personne et par IA, pour l'admin : aujourd'hui, 30 jours, messages, plan.
-- Une ligne par couple (personne, IA) ayant au moins un message sur 30 jours.
create or replace view people_spend as
with paying as (
  select distinct user_id, app_slug from subscriptions
  where stripe_subscription_id is not null and status in ('active', 'past_due', 'trialing')
),
bundle as (
  select distinct user_id from paying where app_slug = 'flowear'
)
select
  u.user_id,
  u.app_slug,
  us.email,
  count(*) filter (where u.created_at >= now() - interval '30 days') as messages_30d,
  coalesce(sum(u.cost_usd) filter (where u.created_at >= (now() at time zone 'utc')::date), 0) as cost_today_usd,
  coalesce(sum(u.cost_usd) filter (where u.created_at >= now() - interval '30 days'), 0) as cost_30d_usd,
  max(u.created_at) as last_message_at,
  case
    when exists (select 1 from bundle b where b.user_id = u.user_id) then 'bundle'
    when exists (select 1 from paying p where p.user_id = u.user_id and p.app_slug = u.app_slug) then 'paid'
    else 'free'
  end as plan
from usage u
left join users us on us.clerk_user_id = u.user_id
where u.created_at >= now() - interval '30 days'
group by u.user_id, u.app_slug, us.email;

revoke all on people_spend from anon, authenticated;
