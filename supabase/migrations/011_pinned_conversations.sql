-- Conversations épinglées : elles restent en tête de la liste, quelle que soit leur date.
alter table conversations add column if not exists pinned boolean not null default false;
create index if not exists conversations_user_app_pinned_idx on conversations (user_id, app_slug, pinned desc, updated_at desc);
