-- Mémoire persistante : origine de chaque note (ia, auto, utilisateur) et date de modification
alter table memory_notes add column if not exists source text not null default 'ai' check (source in ('ai', 'auto', 'user'));
alter table memory_notes add column if not exists updated_at timestamptz not null default now();
