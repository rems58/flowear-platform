-- Tâches et rappels programmés (base, activés IA par IA).

-- ------------------------------------------------------------
-- Tâches : ce qu'une IA a extrait d'un « vide ta tête », avec la première action de deux
-- minutes, les étapes d'un découpage, et le temps estimé contre le temps réel. Le rapport
-- entre les deux, par personne, donne le coefficient de temps (« tu mets toujours 2× »).
-- Rien ici n'est un calendrier : pas d'échéance, pas de récurrence. Une tâche est ouverte,
-- faite, reportée ou jetée, et une tâche jetée ne revient jamais en reproche.
-- ------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  conversation_id uuid,
  title text not null,
  -- La première action, si petite qu'elle en devient facile. Toujours présente.
  first_action text not null,
  -- Étapes du découpage : [{ "title": "...", "done": false }], vide tant qu'on n'a pas découpé.
  steps jsonb not null default '[]'::jsonb,
  -- Énergie qu'il faut pour s'y mettre : c'est ce qui permet de choisir la bonne tâche
  -- quand la personne dit « je suis à plat ».
  energy text not null default 'mid' check (energy in ('low', 'mid', 'high')),
  estimate_min integer check (estimate_min is null or (estimate_min > 0 and estimate_min <= 600)),
  actual_min integer check (actual_min is null or (actual_min > 0 and actual_min <= 1440)),
  status text not null default 'open' check (status in ('open', 'done', 'deferred', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
alter table tasks enable row level security;
revoke all on tasks from anon, authenticated;
create index if not exists tasks_user_app_status_idx on tasks (user_id, app_slug, status, created_at);

-- ------------------------------------------------------------
-- Rappels programmés : « chaque matin à 8 h 30, demande-moi mes trois choses ». Une ligne
-- par rappel, avec l'heure locale et le fuseau de la personne : le serveur calcule le
-- prochain passage en UTC (`next_run_at`) et un cron le déclenche. Le message est celui de
-- l'IA (dans la langue de la personne) ; `prompt` est ce que le chat envoie de sa part
-- quand elle ouvre la notification, pour que l'IA reprenne la main sans rien retaper.
-- Un rappel est toujours choisi par la personne : rien ici n'est créé sans sa demande.
-- ------------------------------------------------------------
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  app_slug text not null,
  kind text not null default 'daily' check (kind in ('daily', 'once')),
  -- Heure locale « HH:MM » et fuseau IANA, tels que la personne les vit.
  time_local text not null check (time_local ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null,
  -- Jours de la semaine (1 = lundi ... 7 = dimanche) ; null = tous les jours.
  days smallint[] check (days is null or (array_length(days, 1) between 1 and 7)),
  message text not null,
  prompt text not null,
  next_run_at timestamptz not null,
  last_sent_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table checkins enable row level security;
revoke all on checkins from anon, authenticated;
create index if not exists checkins_due_idx on checkins (next_run_at) where active;
create index if not exists checkins_user_app_idx on checkins (user_id, app_slug);
