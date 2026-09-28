-- Langues : cinq langues servies, anglais par défaut quand rien ne permet de deviner.
-- Les anciennes lignes gardent leur valeur ; seules les nouvelles reçoivent 'en'.
alter table users alter column locale set default 'en';
alter table users drop constraint if exists users_locale_check;
alter table users add constraint users_locale_check check (locale in ('en', 'fr', 'es', 'de', 'it'));
