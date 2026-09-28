-- Purge des comptes supprimés : la politique de confidentialité promet l'effacement sous
-- trente jours. `purged_at` marque les lignes déjà passées par la purge (contenu effacé,
-- email et client Stripe vidés) pour ne jamais les reprendre.
alter table users add column if not exists purged_at timestamptz;
create index if not exists users_to_purge_idx on users (deleted_at) where deleted_at is not null and purged_at is null;
