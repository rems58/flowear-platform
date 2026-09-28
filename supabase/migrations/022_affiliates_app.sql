-- Studio, étape E (23/09/2026) : un affilié peut être limité à une IA (le créateur qui partage
-- son propre lien) : seules les inscriptions et les paiements de cette IA lui sont attribués.
alter table affiliates add column if not exists app_slug text check (app_slug ~ '^[a-z0-9-]{2,32}$');
-- Paiements par IA, pour le tableau de bord créateur.
create index if not exists events_payment_app_idx on events (app_slug, created_at) where name = 'payment';
