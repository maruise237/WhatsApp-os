-- Défauts du marché africain francophone (0186)
--
-- Les défauts de colonne supposaient le Brésil : devise `BRL`, fuseau
-- `America/Sao_Paulo`, langue `pt-BR`. Le marché par défaut est désormais le
-- Cameroun (XAF / Africa/Douala / fr-FR) ; chaque organisation garde son
-- propre fuseau, sa langue et la devise de chaque montant.
--
-- On ne change QUE le défaut de colonne : aucune ligne existante n'est
-- réécrite — une commande en BRL d'un clone brésilien reste en BRL, une
-- organisation réglée sur São Paulo y reste. Le stockage reste en `_cents`
-- (XAF n'a pas de décimales à l'affichage ; c'est l'affichage qui l'ignore).
--
-- `alter column ... set default` est idempotent ; `if exists` garde la
-- migration applicable sur un clone partiel.
alter table if exists public.organizations      alter column timezone set default 'Africa/Douala';
alter table if exists public.organizations      alter column locale   set default 'fr-FR';
alter table if exists public.ai_faq_items       alter column locale   set default 'fr-FR';
alter table if exists public.crm_leads          alter column currency set default 'XAF';
alter table if exists public.orders             alter column currency set default 'XAF';
alter table if exists public.products           alter column currency set default 'XAF';
alter table if exists public.sales_orders       alter column currency set default 'XAF';
alter table if exists public.sales_order_items  alter column currency set default 'XAF';

-- La documentation de colonne citait encore pt-BR comme exemple et repli.
comment on column public.contacts.locale is
  'Langue préférée du contact (ex. : fr-FR, en-US). NULL = hérite de la langue de l''organisation (repli : fr-FR).';
