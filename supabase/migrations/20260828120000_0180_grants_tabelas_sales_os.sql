-- AI WhatsApp Sales OS — garantia de privilégios para os papéis da Data API (0180)
--
-- As migrações 0176–0179 criaram/alteraram tabelas sem GRANT explícito. Num
-- banco onde os DEFAULT PRIVILEGES do baseline nunca foram aplicados (ex.: Neon
-- migrado por `db push`), as tabelas nascem sem privilégio para `anon` /
-- `authenticated` / `service_role` e a Data API responde `permission denied for
-- table X` — Inbox, Contatos, agentes IA e painel do vendedor caem em 500.
--
-- Medido em produção (2026-08-28): `has_table_privilege('authenticated',
-- 'ai_agents','SELECT') = f` com o baseline declarando `GRANT ALL`. Este arquivo
-- reaplica o padrão do baseline de forma idempotente, inclusive em instalações
-- onde as tabelas já existem. Seguro rodar quantas vezes for preciso.

-- 1) Cobertura geral: todo o schema public, para os três papéis.
grant all on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- 2) Invariante append-only (L-10): estes dois diários não aceitam escrita
--    direta de anon/authenticated — só leitura + manutenção estrutural.
revoke all on table public.event_log from anon, authenticated;
revoke all on table public.webhook_events_log from anon, authenticated;
grant select, references, trigger, truncate, maintain on table public.event_log to anon, authenticated;
grant select, references, trigger, truncate, maintain on table public.webhook_events_log to anon, authenticated;

-- 3) Tabelas sensíveis: sem anon (espelha o baseline; RLS não é suficiente
--    quando o papel não tem privilégio nenhum).
revoke all on table public.ai_agent_runs from anon;
revoke all on table public.ai_agent_versions from anon;
revoke all on table public.ai_provider_credentials from anon;
revoke all on table public.ai_provider_credentials_safe from anon;
revoke all on table public.crm_lead_activities from anon;
revoke all on table public.storage_redaction_queue from anon;
grant all on table public.ai_agent_runs to authenticated, service_role;
grant all on table public.ai_agent_versions to authenticated, service_role;
grant all on table public.ai_provider_credentials to authenticated, service_role;
grant all on table public.ai_provider_credentials_safe to authenticated, service_role;
grant all on table public.crm_lead_activities to authenticated, service_role;
grant all on table public.storage_redaction_queue to authenticated, service_role;

-- 4) Schema, sequências e funções.
grant usage on schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- regra 2 do baseline: as 5 funções que authenticated NÃO pode executar
-- (criptografia e limpeza são caminho exclusivo de service_role).
revoke execute on function public.fn_audit_log_row() from authenticated;
revoke execute on function public.fn_decrypt_oauth(bytea) from authenticated;
revoke execute on function public.fn_encrypt_oauth(text) from authenticated;
revoke execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) from authenticated;
revoke execute on function public.fn_update_budget_consumption() from authenticated;

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
