-- Offre de bienvenue (Pro à moitié prix le premier mois, 72 h après l'inscription) : consommée une fois.
alter table users add column if not exists welcome_offer_used_at timestamptz;
