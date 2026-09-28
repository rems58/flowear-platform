-- Commission en pourcentage des paiements encaissés (événement `payment`, webhook invoice.paid),
-- pendant `months` mensualités après le premier paiement (null = sans limite). `percent` null = mode fixe.
alter table affiliates add column if not exists percent numeric(5, 2) check (percent is null or (percent >= 0 and percent <= 100));
alter table affiliates add column if not exists months integer check (months is null or (months >= 1 and months <= 120));
create index if not exists events_payment_user_idx on events (user_id, created_at) where name = 'payment';
