-- Tableau par défaut d'une NOUVELLE organisation en français (0181)
--
-- Le trigger `trg_seed_default_pipeline_for_org` créait « Pedidos » et ses huit
-- colonnes en portugais : c'était le premier tableau vu après l'installation,
-- affiché tel quel dans l'onboarding (« Ce qui est venu avec l'installation
-- (Pedidos) ») et dans le Kanban.
--
-- Seuls les NOMS changent. Les slugs restent identiques : ils peuvent figurer
-- dans une URL ou une automatisation d'un clone, et ne sont jamais affichés.
-- Les tableaux des organisations existantes ne sont PAS renommés : le vendeur a
-- pu les personnaliser, et un renommage silencieux écraserait son choix.
-- `create or replace` conserve les privilèges déjà accordés à la fonction.

create or replace function public.fn_seed_default_pipeline_for_org() returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
  as $$
declare
  v_pipeline_id uuid;
  v_position numeric := 1000;
  r record;
begin
  insert into public.crm_pipelines (organization_id, name, slug, is_default, position)
  values (new.id, 'Commandes', 'pedidos', true, 1000)
  returning id into v_pipeline_id;

  for r in
    select * from (values
      ('Panier abandonné',   'carrinho_abandonado',  false, false),
      ('Paiement attendu',   'aguardando_pagamento', false, false),
      ('Payée',              'pago',                 true,  false),
      ('En préparation',     'em_separacao',         false, false),
      ('Expédiée',           'enviado',              false, false),
      ('Livrée',             'entregue',             false, false),
      ('Après-vente',        'pos_venda',            false, false),
      ('Annulée',            'cancelado',            false, true)
    ) as t(stage_name, stage_slug, won, lost)
  loop
    insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_won, is_lost)
    values (new.id, v_pipeline_id, r.stage_name, r.stage_slug, v_position, r.won, r.lost);
    v_position := v_position + 1000;
  end loop;

  return new;
end$$;
