-- Une commande payée peut enfin partir en livraison (0182)
--
-- La 0177 écrivait `(status = 'payée') = (paid_at is not null and paid_by_user_id
-- is not null)` : une ÉQUIVALENCE. Or `payée → a_livrer → livree` garde la trace
-- du paiement — et dès que le statut quittait `payée`, `paid_at` encore rempli
-- violait la contrainte. Résultat mesuré par l'écran (pile locale, 2026-10-19) :
-- « Préparer la livraison » échouait toujours, aucune commande payée ne pouvait
-- être livrée.
--
-- Ce que la règle voulait dire, en deux implications :
-- 1. une commande `payée` a une date et un auteur de paiement (P3 : un humain) ;
-- 2. une date de paiement n'existe que sur une commande payée, à livrer ou livrée.
--
-- Pas de correction de données préalable : sous l'ancienne contrainte, `paid_at`
-- rempli n'était possible qu'avec `payée`, qui satisfait les deux nouvelles.

alter table public.sales_orders drop constraint if exists sales_orders_check;
alter table public.sales_orders drop constraint if exists sales_orders_check1;

alter table public.sales_orders drop constraint if exists sales_orders_payee_a_un_auteur;
alter table public.sales_orders add constraint sales_orders_payee_a_un_auteur
  check (status <> 'payée' or (paid_at is not null and paid_by_user_id is not null));

alter table public.sales_orders drop constraint if exists sales_orders_paiement_seulement_si_payee;
alter table public.sales_orders add constraint sales_orders_paiement_seulement_si_payee
  check (paid_at is null or status in ('payée', 'a_livrer', 'livree'));
