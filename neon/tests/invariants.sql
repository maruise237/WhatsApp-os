-- WhatsApp OS / Neon — contrôles post-baseline
-- À exécuter uniquement sur une branche Neon disposable avec ON_ERROR_STOP=1.
-- Les tests d’accès ci-dessous supposent deux organisations et deux utilisateurs
-- de fixture déjà créés par l’environnement de test.

\set ON_ERROR_STOP on

-- La baseline doit fournir RLS sur toutes les tables multi-tenant critiques.
DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'conversations', 'messages', 'crm_leads', 'sales_orders', 'payment_proofs', 'event_log'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = required_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'rls_missing:%', required_table;
    END IF;
  END LOOP;
END $$;

-- Le gate humain est encodé au niveau SQL : une commande payée doit porter
-- simultanément la preuve temporelle et l’utilisateur qui l’a confirmée.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales_orders'::regclass
      AND conname = 'sales_orders_check'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales_orders'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%paid_by_user_id%'
  ) THEN
    RAISE EXCEPTION 'human_payment_gate_missing';
  END IF;
END $$;

-- La table de preuve doit refuser approved sans reviewer et reviewed_at.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.payment_proofs'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%review_status%'
      AND pg_get_constraintdef(oid) ILIKE '%reviewed_by_user_id%'
  ) THEN
    RAISE EXCEPTION 'payment_proof_review_gate_missing';
  END IF;
END $$;

-- Vérification de la présence de la fonction transactionnelle de commande.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_sales_order', 'confirm_sales_order_payment', 'mark_sales_order_paid')
  ) THEN
    RAISE EXCEPTION 'sales_order_rpc_missing';
  END IF;
END $$;

-- La baseline Neon ne doit pas dépendre d’une publication Supabase Realtime.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'supabase_realtime_publication_present';
  END IF;
END $$;

-- Pour les tests cross-tenant avec fixtures : remplacer les UUID ci-dessous et
-- exécuter chaque requête via Data API avec le JWT utilisateur correspondant.
-- SET LOCAL ROLE authenticated;
-- SELECT set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
-- SELECT set_config('request.jwt.claim.role', 'authenticated', true);
-- SELECT organization_id FROM public.crm_leads WHERE organization_id = 'ORG_B_UUID';
-- => zéro ligne attendue, jamais une ligne de l’organisation B.
-- SELECT organization_id FROM public.sales_orders WHERE organization_id = 'ORG_B_UUID';
-- => zéro ligne attendue.
