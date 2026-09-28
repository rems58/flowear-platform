-- Studio (24/09/2026) : ce que le créateur décrit en mots et que Flowear construit pour lui
-- (aujourd'hui : un questionnaire). Hors manifeste : rien ici n'est servi aux utilisateurs.
alter table creator_apps add column if not exists requests jsonb not null default '{}'::jsonb;
