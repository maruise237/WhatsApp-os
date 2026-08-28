-- AI WhatsApp Sales OS — garantia de privilégios para os papéis da Data API (0180)
--
-- As migrações 0176–0179 criaram/alteraram tabelas sem GRANT explícito. Num
-- banco onde os DEFAULT PRIVILEGES do baseline nunca foram aplicados (ex.: Neon
-- migrado por `db push`), as tabelas nascem sem privilégio para `anon` /
-- `authenticated` / `service_role` e a Data API responde `permission denied for
-- table X` — Inbox, Contatos, agentes IA e painel do vendedor caem em 500.
--
-- Medido em produção (2026-08-28): `has_table_privilege('authenticated',
-- 'ai_agents','SELECT') = f` com o baseline declarando `GRANT ALL`.
--
-- ⚠️ NÃO é um "grant all" cego: replica EXATAMENTE a política do baseline
-- (fonte de verdade). As tabelas sem grant explícito no baseline nascem com
-- ALL via DEFAULT PRIVILEGES; as tabelas ESPECIAIS (append-only, sensíveis)
-- têm o padrão delas reaplicado por cima. As 16 funções service-only do
-- baseline são retiradas de `authenticated`. Idempotente — seguro rodar
-- quantas vezes for preciso.

-- 1) Cobertura geral: todo o schema public, para os três papéis (equivale ao
--    DEFAULT PRIVILEGES ... GRANT ALL ON TABLES do baseline, aplicado às
--    tabelas que já existem).
grant all on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- 2) Tables especiales — réplica exata dos grants explícitos do baseline.

-- api_audit_log: append-only TOTAL — ninguém tem UPDATE/DELETE, nem service_role.
revoke all on table public.api_audit_log from anon, authenticated, service_role;
grant select, insert, references, trigger, truncate, maintain on table public.api_audit_log to anon, authenticated, service_role;

-- crm_lead_activities: anon/authenticated sem UPDATE/DELETE; service_role com ALL.
revoke all on table public.crm_lead_activities from anon, authenticated;
grant select, insert, references, trigger, truncate, maintain on table public.crm_lead_activities to anon, authenticated;

-- event_log / webhook_events_log: append-only (L-10) — sem INSERT para anon/auth.
revoke all on table public.event_log from anon, authenticated;
revoke all on table public.webhook_events_log from anon, authenticated;
grant select, references, trigger, truncate, maintain on table public.event_log to anon, authenticated;
grant select, references, trigger, truncate, maintain on table public.webhook_events_log to anon, authenticated;

-- Tabelas sensíveis: sem anon (espelha o baseline).
revoke all on table public.ai_agent_runs from anon;
revoke all on table public.ai_agent_versions from anon;
revoke all on table public.ai_provider_credentials from anon;
revoke all on table public.ai_provider_credentials_safe from anon;
revoke all on table public.storage_redaction_queue from anon;
grant all on table public.ai_agent_runs to authenticated, service_role;
grant all on table public.ai_agent_versions to authenticated, service_role;
grant all on table public.ai_provider_credentials to authenticated, service_role;
grant all on table public.ai_provider_credentials_safe to authenticated, service_role;
grant all on table public.storage_redaction_queue to authenticated, service_role;

-- 3) Schema e sequências.
grant usage on schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- 4) Funções: cobertura geral para authenticated/service_role, DEPOIS retirada
--    das 16 funções service-only do baseline (criptografia, upserts WAHA,
--    auditoria, limpeza — caminho exclusivo de service_role).
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function public.activate_kb_version(uuid, uuid) from authenticated;
revoke execute on function public.fn_agora() from authenticated;
revoke execute on function public.fn_audit_log_row() from authenticated;
revoke execute on function public.fn_decrypt_oauth(bytea) from authenticated;
revoke execute on function public.fn_emit_conversation_routing() from authenticated;
revoke execute on function public.fn_encrypt_oauth(text) from authenticated;
revoke execute on function public.fn_estampar_atribuicao_de_anuncio(uuid, text, jsonb) from authenticated;
revoke execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) from authenticated;
revoke execute on function public.fn_liberar_leads_do_agente() from authenticated;
revoke execute on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) from authenticated;
revoke execute on function public.fn_publish_ai_agent_version(uuid, uuid, uuid) from authenticated;
revoke execute on function public.fn_redigir_captacoes_do_contato_anonimizado() from authenticated;
revoke execute on function public.fn_update_budget_consumption() from authenticated;
revoke execute on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) from authenticated;
revoke execute on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) from authenticated;
revoke execute on function public.rls_auto_enable() from authenticated;

-- 5) DEFAULT PRIVILEGES do dono real do schema: toda tabela futura nasce
--    concedida. Idempotente em Supabase (dono = postgres) e Neon (dono =
--    neondb_owner / outro), porque o dono é descoberto em runtime.
do $$
declare v_owner name;
begin
  select tableowner into v_owner
    from pg_tables
   where schemaname = 'public'
   limit 1;

  if v_owner is not null then
    execute format(
      'alter default privileges for role %I in schema public grant all on tables to anon, authenticated, service_role',
      v_owner
    );
    execute format(
      'alter default privileges for role %I in schema public grant all on sequences to anon, authenticated, service_role',
      v_owner
    );
    execute format(
      'alter default privileges for role %I in schema public grant all on functions to anon, authenticated, service_role',
      v_owner
    );
  end if;
end $$;
