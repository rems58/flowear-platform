-- Avis libres depuis le menu d'une IA : une note sur cinq, un mot si la personne veut.
-- Rangés avec les signalements (même boîte admin), distingués par leur source.
alter table reports drop constraint if exists reports_source_check;
alter table reports add constraint reports_source_check check (source in ('message', 'contact', 'review', 'system'));
alter table reports add column if not exists rating smallint check (rating is null or rating between 1 and 5);
