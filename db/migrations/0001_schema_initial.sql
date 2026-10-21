-- Schéma initial de WhatsApp OS pour Neon (Postgres 17).
-- Prérequis fournis par Neon : Neon Auth (schéma `neon_auth`) et la Data API
-- (extension pg_session_jwt : `auth.uid()`). En local, `db/local/emulation-neon.sql`
-- les reproduit. Idempotent : peut être rejoué sans erreur.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- vector, citext et pg_trgm vivent dans public (types référencés `public.vector`, …).
-- Une base installée par l'ancienne baseline Neon les avait dans `extensions` : on les déplace.
do $$
declare e text;
begin
  foreach e in array array['vector', 'citext', 'pg_trgm'] loop
    if exists (select 1 from pg_extension x join pg_namespace n on n.oid = x.extnamespace
                where x.extname = e and n.nspname <> 'public') then
      execute format('alter extension %I set schema public', e);
    end if;
  end loop;
end
$$;
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;

SET statement_timeout = 0;

SET lock_timeout = 0;

SET idle_in_transaction_session_timeout = 0;

SET client_encoding = 'UTF8';

SET standard_conforming_strings = on;

SELECT pg_catalog.set_config('search_path', '', false);

SET check_function_bodies = false;

SET xmloption = content;

SET client_min_messages = warning;

SET row_security = off;

CREATE OR REPLACE FUNCTION "public"."activate_kb_version"("p_agent_id" "uuid", "p_version_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_org uuid;
  v_version_org uuid;
begin
  select organization_id into v_org from public.ai_agents where id = p_agent_id;
  if v_org is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;
  select organization_id into v_version_org
    from public.ai_knowledge_versions
   where id = p_version_id and agent_id = p_agent_id;
  if v_version_org is null or v_version_org <> v_org then
    raise exception 'kb_version_not_found_or_cross_tenant' using errcode = '42501';
  end if;
  update public.ai_knowledge_versions
     set is_active = false
   where agent_id = p_agent_id and id <> p_version_id and is_active = true;
  update public.ai_knowledge_versions
     set is_active = true,
         activated_at = coalesce(activated_at, now())
   where id = p_version_id;
  update public.ai_agents
     set active_kb_version_id = p_version_id,
         updated_at = now()
   where id = p_agent_id;
end$$;

CREATE OR REPLACE FUNCTION "public"."emit_event"("p_event_type" "text", "p_entity_kind" "text", "p_entity_id" "uuid", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := p_organization_id;
  if v_org_id is null then
    -- Try to resolve from caller's first org (best-effort; trigger callers MUST pass it)
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;
  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;
  return v_event_id;
end $$;

CREATE OR REPLACE FUNCTION "public"."fn_audit_log_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_action text;
  v_org    uuid;
begin
  if tg_op = 'INSERT' then
    v_action := tg_table_name || '.created';
    v_org    := new.organization_id;
  elsif tg_op = 'UPDATE' then
    v_action := tg_table_name || '.updated';
    v_org    := new.organization_id;
  elsif tg_op = 'DELETE' then
    v_action := tg_table_name || '.deleted';
    v_org    := old.organization_id;
  end if;
  insert into public.api_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    v_org,
    auth.uid(),
    v_action,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('changed_fields', '[diff suppressed in v0.1]')
      else '{}'::jsonb
    end
  );
  return coalesce(new, old);
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_crm_lead_close_on_stage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_is_won  boolean;
  v_is_lost boolean;
begin
  if tg_op = 'UPDATE'
     and new.stage_id is not distinct from old.stage_id
     and new.status   is not distinct from old.status then
    return new;
  end if;
  select is_won, is_lost into v_is_won, v_is_lost
    from public.crm_stages where id = new.stage_id;
  if v_is_won then
    new.status := 'won';
    new.closed_at := coalesce(new.closed_at, now());
  elsif v_is_lost then
    new.status := 'lost';
    new.closed_at := coalesce(new.closed_at, now());
  else
    if tg_op = 'UPDATE' and old.status in ('won','lost') then
      new.status := 'open';
      new.closed_at := null;
    end if;
  end if;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_decrypt_oauth"("ciphertext" "bytea") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
begin
  return pgp_sym_decrypt(ciphertext, k);
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_emit_channel_session_status_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform public.fn_log_event(
    new.organization_id, 'channel_session.status_changed',
    jsonb_build_object(
      'channel_session_id', new.id, 'from_status', old.status, 'to_status', new.status,
      'status_reason', new.status_reason, 'phone_number', new.phone_number
    )
  );
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_emit_event_on_lead_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.fn_log_event(
      new.organization_id, 'lead.created',
      jsonb_build_object('lead_id', new.id, 'pipeline_id', new.pipeline_id,
                         'stage_id', new.stage_id, 'contact_id', new.contact_id,
                         'source', new.source)
    );
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    perform public.fn_log_event(
      new.organization_id, 'lead.stage_changed',
      jsonb_build_object('lead_id', new.id, 'from_stage_id', old.stage_id, 'to_stage_id', new.stage_id)
    );
  end if;
  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform public.fn_log_event(new.organization_id, 'lead.won',
        jsonb_build_object('lead_id', new.id, 'value_cents', new.value_cents));
    elsif new.status = 'lost' then
      perform public.fn_log_event(new.organization_id, 'lead.lost',
        jsonb_build_object('lead_id', new.id, 'lost_reason', new.lost_reason));
    elsif new.status = 'open' then
      perform public.fn_log_event(new.organization_id, 'lead.reopened',
        jsonb_build_object('lead_id', new.id));
    end if;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    perform public.fn_log_event(new.organization_id, 'lead.assigned',
      jsonb_build_object('lead_id', new.id, 'from_user_id', old.owner_user_id, 'to_user_id', new.owner_user_id));
  end if;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_emit_message_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_event text;
begin
  if new.direction = 'inbound' then
    v_event := 'message.received';
  else
    v_event := case new.status
                 when 'sending' then 'message.sending'
                 when 'sent' then 'message.sent'
                 when 'failed' then 'message.failed'
                 else 'message.outbound'
               end;
  end if;
  perform public.fn_log_event(
    new.organization_id, v_event,
    jsonb_build_object(
      'message_id', new.id, 'conversation_id', new.conversation_id,
      'contact_id', new.contact_id, 'direction', new.direction,
      'type', new.type, 'status', new.status, 'external_id', new.external_id,
      'channel_session_id', new.channel_session_id,
      'body_preview', "left"(new.body, 280)
    )
  );
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_encrypt_oauth"("plaintext" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
begin
  if k is null or length(k) < 32 then
    raise exception 'NUVEMSHOP_OAUTH_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_encrypt(plaintext, k, 'cipher-algo=aes256');
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and revoked_at is null
  );
$$;

CREATE OR REPLACE FUNCTION "public"."fn_lgpd_cascade_redact_contact"("p_organization_id" "uuid", "p_contact_id" "uuid", "p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_already bool;
  v_counts jsonb := '{}'::jsonb;
  v_media_paths text[] := '{}';
  v_anon_label text;
  v_count int;
begin
  select is_anonymized into v_already
    from contacts
    where id = p_contact_id and organization_id = p_organization_id;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  if v_already then
    return jsonb_build_object('already_anonymized', true, 'counts', v_counts, 'media_paths', v_media_paths);
  end if;
  v_anon_label := 'Cliente Anonimizado #' || substring(p_contact_id::text from 1 for 8);
  -- Collect media storage paths (we only delete what we own — media_storage_path)
  select coalesce(array_agg(distinct media_storage_path) filter (where media_storage_path is not null), '{}')
    into v_media_paths
    from messages
    where organization_id = p_organization_id
      and conversation_id in (
        select id from conversations
          where contact_id = p_contact_id and organization_id = p_organization_id
      );
  -- 1. contacts (irreversible)
  update contacts set
    name = v_anon_label,
    display_name = v_anon_label,
    email = null,
    -- email_normalized NÃO entra: é GENERATED ALWAYS AS (lower(trim(email)))
    -- e o Postgres recusa escrita nela — a linha acima já a zera por derivação.
    -- Com a atribuição, o cascade INTEIRO abortava e nada era anonimizado.
    phone_number = null,
    cpf_encrypted = null,
    cpf_hash = null,
    birthdate = null,
    is_anonymized = true,
    anonymized_at = now(),
    consent = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('contacts', v_count);
  -- 2. conversations metadata + preview strip
  update conversations set
    metadata = '{}'::jsonb,
    last_message_preview = null,
    updated_at = now()
  where contact_id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('conversations', v_count);
  -- 3. messages: redact body + null media + strip metadata (preserve status/timestamps/conversation_id)
  update messages set
    body = '[mensagem anonimizada]',
    media_url = null,
    media_mime = null,
    media_size_bytes = null,
    media_storage_path = null,
    metadata = '{}'::jsonb,
    updated_at = now()
  where organization_id = p_organization_id
    and conversation_id in (
      select id from conversations
        where contact_id = p_contact_id and organization_id = p_organization_id
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('messages', v_count);
  -- 4. crm_lead_activities — strip payload, metadata E reason (migration 0071).
  --    `reason` é texto livre escrito por LLM sobre a conversa do lead: supor que
  --    nunca conterá um nome é a suposição que falha. `evidence` NÃO é limpa —
  --    guarda só ids, e as linhas apontadas são redigidas por conta própria.
  update crm_lead_activities set
    payload = '{}'::jsonb,
    metadata = '{}'::jsonb,
    reason = null
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or lead_id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
      or lead_id in (
        select id from crm_leads
          where contact_id = p_contact_id and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('activities', v_count);
  -- 5. crm_leads — strip title/description/custom_fields/source_metadata/tags but PRESERVE pipeline/stage/value
  update crm_leads set
    title = v_anon_label,
    description = null,
    custom_fields = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('leads', v_count);
  -- 6. orders — PRESERVE values + status + timestamps. Strip personal fields from payload jsonb
  --    and replace customer_external_id with null (FK-safe; soft de-link). Keep contact_id null.
  update orders set
    payload = (coalesce(payload, '{}'::jsonb))
      - 'customer'
      - 'customer_name'
      - 'customer_email'
      - 'customer_phone'
      - 'shipping_address'
      - 'billing_address'
      - 'contact_identification',
    customer_external_id = null,
    contact_id = null,
    is_anonymized = true,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_count);
  -- 7. enqueue media for async deletion (idempotent via unique (bucket, object_path))
  if array_length(v_media_paths, 1) > 0 then
    insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
    select p_organization_id, p_request_id, 'whatsapp-media', path
      from unnest(v_media_paths) as path
      where path is not null and length(path) > 0
    on conflict (bucket, object_path) do nothing;
  end if;
  -- 8. dense audit row
  insert into api_audit_log (organization_id, action, actor_user_id, resource_type, resource_id, metadata, bypassed_rls)
  values (
    p_organization_id,
    'lgpd.redact_executed',
    null,
    'contact',
    p_contact_id,
    jsonb_build_object(
      'cascaded_to', v_counts,
      'media_queued', coalesce(array_length(v_media_paths, 1), 0),
      'request_id', p_request_id
    ),
    true
  );
  return jsonb_build_object(
    'already_anonymized', false,
    'counts', v_counts,
    'media_paths', v_media_paths
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_log_event"("p_organization_id" "uuid", "p_event_type" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entity_kind text;
  v_entity_id   uuid;
begin
  -- Derive entity_kind from event_type (e.g. 'lead.created' -> 'lead')
  v_entity_kind := split_part(p_event_type, '.', 1);
  v_entity_id   := (p_payload ->> 'lead_id')::uuid;
  if v_entity_id is null then
    v_entity_id := (p_payload ->> (v_entity_kind || '_id'))::uuid;
  end if;
  return public.emit_event(
    p_event_type,
    v_entity_kind,
    v_entity_id,
    p_payload,
    '{}'::jsonb,
    p_organization_id
  );
end $$;

CREATE OR REPLACE FUNCTION "public"."fn_publish_ai_agent_version"("p_org_id" "uuid", "p_agent_id" "uuid", "p_version_id" "uuid") RETURNS TABLE("agent_id" "uuid", "version_id" "uuid", "previous_version_id" "uuid", "published_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_agent record;
  v_version record;
  v_credential record;
  v_session record;
  v_model_count integer;
  v_previous_version_id uuid;
  v_published_at timestamptz := now();
begin
  select a.id, a.organization_id, a.published_version_id, a.archived_at
    into v_agent
  from public.ai_agents a
  where a.id = p_agent_id
  for update;
  if not found then
    raise exception 'agent_not_found' using errcode = 'P0001';
  end if;
  if v_agent.organization_id <> p_org_id then
    raise exception 'agent_not_found' using errcode = 'P0001';
  end if;
  if v_agent.archived_at is not null then
    raise exception 'agent_archived' using errcode = 'P0001';
  end if;
  select v.id, v.organization_id, v.agent_id, v.status, v.provider, v.model,
         v.credential_id, v.channel_session_id
    into v_version
  from public.ai_agent_versions v
  where v.id = p_version_id
  for update;
  if not found then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  if v_version.agent_id <> p_agent_id or v_version.organization_id <> p_org_id then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  if v_version.status not in ('draft', 'superseded') then
    raise exception 'version_invalid_state' using errcode = 'P0001';
  end if;
  if v_version.credential_id is null then
    raise exception 'credential_missing' using errcode = 'P0001';
  end if;
  select c.id, c.organization_id, c.provider, c.is_active, c.validated_at
    into v_credential
  from public.ai_provider_credentials c
  where c.id = v_version.credential_id;
  if not found or v_credential.organization_id <> p_org_id then
    raise exception 'credential_not_found' using errcode = 'P0001';
  end if;
  if not v_credential.is_active then
    raise exception 'credential_inactive' using errcode = 'P0001';
  end if;
  if v_credential.validated_at is null then
    raise exception 'credential_not_validated' using errcode = 'P0001';
  end if;
  if v_credential.provider <> v_version.provider then
    raise exception 'credential_provider_mismatch' using errcode = 'P0001';
  end if;
  select s.id, s.organization_id, s.status
    into v_session
  from public.channel_sessions s
  where s.id = v_version.channel_session_id;
  if not found or v_session.organization_id <> p_org_id then
    raise exception 'channel_session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status <> 'WORKING' then
    raise exception 'channel_session_offline' using errcode = 'P0001';
  end if;
  select count(*)
    into v_model_count
  from public.ai_models m
  where m.provider = v_version.provider
    and m.model_id = v_version.model
    and m.deprecated_at is null;
  if v_model_count = 0 then
    raise exception 'model_not_found' using errcode = 'P0001';
  end if;
  v_previous_version_id := v_agent.published_version_id;
  if v_previous_version_id is not null and v_previous_version_id <> p_version_id then
    update public.ai_agent_versions
       set status = 'superseded', superseded_at = v_published_at
     where id = v_previous_version_id;
  end if;
  update public.ai_agent_versions
     set status = 'published',
         published_at = v_published_at,
         superseded_at = null
   where id = p_version_id;
  update public.ai_agents
     set published_version_id = p_version_id,
         updated_at = v_published_at
   where id = p_agent_id;
  return query
    select p_agent_id, p_version_id, v_previous_version_id, v_published_at;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_role_at_least"("p_org" "uuid", "p_min" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with levels(role, lvl) as (
    values ('viewer',1),('agent',2),('manager',3),('admin',4)
  )
  select coalesce(
    (select user_lvl.lvl >= min_lvl.lvl
     from levels user_lvl
     join levels min_lvl on min_lvl.role = p_min
     where user_lvl.role = public.fn_user_role_in_org(p_org)),
    false
  );
$$;

CREATE OR REPLACE FUNCTION "public"."fn_seed_default_pipeline_for_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_pipeline_id uuid;
  v_position numeric := 1000;
  r record;
begin
  insert into public.crm_pipelines (organization_id, name, slug, is_default, position)
  values (new.id, 'Pedidos', 'pedidos', true, 1000)
  returning id into v_pipeline_id;
  for r in
    select * from (values
      ('Carrinho abandonado',  'carrinho_abandonado',  false, false),
      ('Aguardando pagamento', 'aguardando_pagamento', false, false),
      ('Pago',                 'pago',                 true,  false),
      ('Em separação',        'em_separacao',         false, false),
      ('Enviado',              'enviado',              false, false),
      ('Entregue',             'entregue',             false, false),
      ('Pós-venda',           'pos_venda',            false, false),
      ('Cancelado',            'cancelado',            false, true)
    ) as t(stage_name, stage_slug, won, lost)
  loop
    insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_won, is_lost)
    values (new.id, v_pipeline_id, r.stage_name, r.stage_slug, v_position, r.won, r.lost);
    v_position := v_position + 1000;
  end loop;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."fn_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;

CREATE OR REPLACE FUNCTION "public"."fn_update_budget_consumption"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.ai_budgets (organization_id, current_month_consumed_cents)
  values (NEW.organization_id, coalesce(NEW.cost_cents, 0))
  on conflict (organization_id) do update
  set current_month_consumed_cents =
        public.ai_budgets.current_month_consumed_cents
        + coalesce(NEW.cost_cents, 0),
      updated_at = now();
  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_update_last_activity_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  update public.crm_leads
     set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
   where id = new.lead_id;
  if new.contact_id is not null then
    update public.contacts
       set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
     where id = new.contact_id;
  end if;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_user_org_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select organization_id from public.user_organizations
  where user_id = auth.uid() and revoked_at is null;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_user_role_in"("p_org" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case public.fn_user_role_in_org(p_org)
    when 'viewer'  then 1
    when 'agent'   then 2
    when 'manager' then 3
    when 'admin'   then 4
    else 0
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_user_role_in_org"("p_org" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.user_organizations
  where user_id = auth.uid() and organization_id = p_org and revoked_at is null
  limit 1;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_validate_activity_lead_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.crm_leads where id = new.lead_id;
  if v_org is null then
    raise exception 'lead_not_found' using errcode = '23503';
  end if;
  if v_org <> new.organization_id then
    raise exception 'lead_org_mismatch' using errcode = '23514';
  end if;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."fn_validate_lost_reason_required"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_canonical text[] := array['requested_by_customer','price','no_response','product_unavailable',
                              'cancelled_by_store','cancelled_by_customer','payment_failed','other'];
  v_pipeline_extra text[];
begin
  if new.status = 'lost' then
    if new.lost_reason is null or length(new.lost_reason) = 0 then
      raise exception 'lost_reason_required' using errcode = '22023';
    end if;
    select coalesce(
      array(select jsonb_array_elements_text(settings->'lost_reasons')), '{}'::text[]
    ) into v_pipeline_extra
    from public.crm_pipelines where id = new.pipeline_id;
    if not (new.lost_reason = any (v_canonical) or new.lost_reason = any (v_pipeline_extra)) then
      raise exception 'lost_reason_invalid: %', new.lost_reason using errcode = '22023';
    end if;
  end if;
  return new;
end$$;

CREATE OR REPLACE FUNCTION "public"."midpoint"("p_prev" numeric, "p_next" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when p_prev is null and p_next is null then 1000::numeric
    when p_prev is null then p_next - 1
    when p_next is null then p_prev + 1
    else (p_prev + p_next) / 2
  end
$$;

CREATE OR REPLACE FUNCTION "public"."retrieve_top_k_chunks"("p_organization_id" "uuid", "p_kb_version_id" "uuid", "p_embedding" "public"."vector", "p_k" integer DEFAULT 5, "p_threshold" real DEFAULT 0.72) RETURNS TABLE("chunk_id" "uuid", "knowledge_source_id" "uuid", "content" "text", "similarity" real, "metadata" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    c.id as chunk_id,
    c.knowledge_source_id,
    c.content,
    (1 - (c.embedding <=> p_embedding))::real as similarity,
    c.metadata
  from public.ai_chunks c
  where c.organization_id = p_organization_id
    and c.kb_version_id   = p_kb_version_id
    and (1 - (c.embedding <=> p_embedding)) >= p_threshold
  order by c.embedding <=> p_embedding asc
  limit greatest(p_k, 0);
$$;

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."ai_agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "agent_version_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "contact_id" "uuid",
    "channel_session_id" "uuid",
    "inbound_message_id" "uuid",
    "outbound_message_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "abort_reason" "text",
    "error_code" "text",
    "error_message" "text",
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "cost_cents" numeric(10,4) DEFAULT 0 NOT NULL,
    "latency_ms" integer,
    "steps_count" integer DEFAULT 0 NOT NULL,
    "tool_calls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_dry_run" boolean DEFAULT false NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_agent_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'aborted'::"text", 'handoff'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_agent_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "system_prompt" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "credential_id" "uuid",
    "tool_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "trigger_config" "jsonb" DEFAULT "jsonb_build_object"('events', "jsonb_build_array"('message'), 'filters', "jsonb_build_object"('ignore_groups', true, 'ignore_self', true, 'keyword_regex', NULL::"unknown", 'business_hours', NULL::"unknown"), 'concurrency', 'one_per_conversation') NOT NULL,
    "channel_session_id" "uuid" NOT NULL,
    "max_steps" integer DEFAULT 10 NOT NULL,
    "token_budget" integer DEFAULT 50000 NOT NULL,
    "cost_budget_cents" integer DEFAULT 50 NOT NULL,
    "history_message_window" integer DEFAULT 20 NOT NULL,
    "history_token_window" integer DEFAULT 8000 NOT NULL,
    "handoff_keywords" "text"[] DEFAULT ARRAY['falar com humano'::"text", 'atendente'::"text", 'pessoa real'::"text"] NOT NULL,
    "handoff_tool_enabled" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "superseded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "ai_agent_versions_cost_budget_cents_check" CHECK ((("cost_budget_cents" >= 1) AND ("cost_budget_cents" <= 10000))),
    CONSTRAINT "ai_agent_versions_max_steps_check" CHECK ((("max_steps" >= 1) AND ("max_steps" <= 25))),
    CONSTRAINT "ai_agent_versions_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'openai'::"text", 'google'::"text"]))),
    CONSTRAINT "ai_agent_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'superseded'::"text", 'archived'::"text"]))),
    CONSTRAINT "ai_agent_versions_token_budget_check" CHECK ((("token_budget" >= 1000) AND ("token_budget" <= 500000)))
);

CREATE TABLE IF NOT EXISTS "public"."ai_agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "model" "text" DEFAULT 'anthropic/claude-sonnet-4-6'::"text" NOT NULL,
    "system_prompt" "text" NOT NULL,
    "config" "jsonb" DEFAULT "jsonb_build_object"('temperature', 0.3, 'max_tokens', 1024, 'rag_top_k', 5, 'rag_similarity_threshold', 0.72, 'context_message_window', 20, 'confidence_threshold', 0.55, 'sentiment_threshold', 0.3, 'zero_data_retention', false) NOT NULL,
    "guardrails" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active_kb_version_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "published_version_id" "uuid",
    "priority" integer DEFAULT 0 NOT NULL,
    "archived_at" timestamp with time zone,
    "kind" "text" DEFAULT 'rag_bot'::"text" NOT NULL,
    CONSTRAINT "ai_agents_kind_check" CHECK (("kind" = ANY (ARRAY['rag_bot'::"text", 'mcp_agent'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_budgets" (
    "organization_id" "uuid" NOT NULL,
    "monthly_limit_cents" integer DEFAULT 5000 NOT NULL,
    "action_at_100pct" "text" DEFAULT 'throttle'::"text" NOT NULL,
    "alarm_threshold_pct" integer DEFAULT 80 NOT NULL,
    "current_month_consumed_cents" numeric(12,4) DEFAULT 0 NOT NULL,
    "current_period_start" "date" DEFAULT ("date_trunc"('month'::"text", "now"()))::"date" NOT NULL,
    "last_alarm_sent_at" timestamp with time zone,
    "is_throttled" boolean DEFAULT false NOT NULL,
    "is_disabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_budgets_action_at_100pct_check" CHECK (("action_at_100pct" = ANY (ARRAY['throttle'::"text", 'disable'::"text"]))),
    CONSTRAINT "ai_budgets_alarm_threshold_pct_check" CHECK ((("alarm_threshold_pct" >= 50) AND ("alarm_threshold_pct" <= 99)))
);

CREATE TABLE IF NOT EXISTS "public"."ai_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "knowledge_source_id" "uuid" NOT NULL,
    "kb_version_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "content" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "token_count" integer NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."ai_faq_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "knowledge_source_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "locale" "text" DEFAULT 'fr-FR'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."ai_invocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "invocation_kind" "text" NOT NULL,
    "model" "text" NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer GENERATED ALWAYS AS (("prompt_tokens" + "completion_tokens")) STORED,
    "latency_ms" integer NOT NULL,
    "cost_cents" numeric(10,4) DEFAULT 0 NOT NULL,
    "finish_reason" "text",
    "citations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "prompt_blob_path" "text",
    "response_blob_path" "text",
    "error_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_invocations_invocation_kind_check" CHECK (("invocation_kind" = ANY (ARRAY['bot_respond'::"text", 'sentiment_classify'::"text", 'triage_classify'::"text", 'embedding_generate'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_knowledge_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_indexed_at" timestamp with time zone,
    "last_index_status" "text",
    "last_index_error" "text",
    "chunks_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "ingested_at" timestamp with time zone,
    CONSTRAINT "ai_knowledge_sources_last_index_status_check" CHECK (("last_index_status" = ANY (ARRAY['success'::"text", 'partial'::"text", 'failed'::"text"]))),
    CONSTRAINT "ai_knowledge_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['faq'::"text", 'policy'::"text", 'catalog'::"text", 'conversations'::"text", 'conversation'::"text", 'nuvemshop_catalog'::"text"]))),
    CONSTRAINT "ai_knowledge_sources_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'archived'::"text", 'building'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_knowledge_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "sources_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_chunks" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "activated_by" "uuid",
    "status" "text" DEFAULT 'building'::"text",
    "error_message" "text",
    "indexed_at" timestamp with time zone,
    CONSTRAINT "ai_knowledge_versions_status_check" CHECK (("status" = ANY (ARRAY['building'::"text", 'ready'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "model_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "context_window" integer,
    "input_price_per_million_cents" integer,
    "output_price_per_million_cents" integer,
    "supports_tools" boolean DEFAULT true NOT NULL,
    "is_default_for_provider" boolean DEFAULT false NOT NULL,
    "deprecated_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "ai_models_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'openai'::"text", 'google'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_pricing" (
    "model" "text" NOT NULL,
    "prompt_cents_per_million_tokens" numeric(10,4),
    "completion_cents_per_million_tokens" numeric(10,4),
    "embedding_cents_per_million_tokens" numeric(10,4),
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "superseded_at" timestamp with time zone,
    "notes" "text"
);

CREATE TABLE IF NOT EXISTS "public"."ai_provider_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "label" "text" NOT NULL,
    "api_key_encrypted" "bytea" NOT NULL,
    "api_key_iv" "bytea" NOT NULL,
    "api_key_tag" "bytea" NOT NULL,
    "api_key_last4" "text" NOT NULL,
    "validated_at" timestamp with time zone,
    "validation_error" "text",
    "models_available" "text"[],
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_provider_credentials_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'openai'::"text", 'google'::"text"])))
);

CREATE OR REPLACE VIEW "public"."ai_provider_credentials_safe" WITH ("security_invoker"='true') AS
 SELECT "id",
    "organization_id",
    "provider",
    "label",
    "api_key_last4",
    "validated_at",
    "validation_error",
    "models_available",
    "is_active",
    "created_by",
    "created_at",
    "updated_at"
   FROM "public"."ai_provider_credentials";

CREATE TABLE IF NOT EXISTS "public"."api_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "actor_user_id" "uuid",
    "actor_api_token_id" "uuid",
    "acting_as_platform_admin" boolean DEFAULT false NOT NULL,
    "actor_ip" "inet",
    "actor_user_agent" "text",
    "action" "text" NOT NULL,
    "resource_type" "text",
    "resource_id" "uuid",
    "request_id" "text",
    "bypassed_rls" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."api_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "prefix" "text" NOT NULL,
    "token_hash" "bytea" NOT NULL,
    "scopes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_used_at" timestamp with time zone,
    "last_used_ip" "inet",
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."channel_session_warmup" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "channel_session_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "messages_sent" integer DEFAULT 0 NOT NULL,
    "messages_received" integer DEFAULT 0 NOT NULL,
    "unique_contacts" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."channel_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waha_session_name" "text" NOT NULL,
    "engine" "text" DEFAULT 'NOWEB'::"text" NOT NULL,
    "webhook_path_token" "text" DEFAULT "replace"(("extensions"."uuid_generate_v4"())::"text", '-'::"text", ''::"text") NOT NULL,
    "webhook_secret_encrypted" "bytea" NOT NULL,
    "status" "text" DEFAULT 'STARTING'::"text" NOT NULL,
    "status_reason" "text",
    "phone_number" "text",
    "display_name" "text",
    "last_health_check_at" timestamp with time zone,
    "last_status_change_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consecutive_health_fails" integer DEFAULT 0 NOT NULL,
    "daily_message_limit" integer DEFAULT 300 NOT NULL,
    "warmup_started_at" timestamp with time zone,
    "warmup_completed_at" timestamp with time zone,
    "is_warmup_complete" boolean GENERATED ALWAYS AS (("warmup_completed_at" IS NOT NULL)) STORED,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "channel_sessions_engine_check" CHECK (("engine" = ANY (ARRAY['NOWEB'::"text", 'WEBJS'::"text"]))),
    CONSTRAINT "channel_sessions_status_check" CHECK (("status" = ANY (ARRAY['STARTING'::"text", 'SCAN_QR_CODE'::"text", 'WORKING'::"text", 'STOPPED'::"text", 'FAILED'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text",
    "display_name" "text",
    "email" "text",
    "email_normalized" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "email"))) STORED,
    "phone_number" "text",
    "cpf_encrypted" "bytea",
    "cpf_hash" "text",
    "birthdate" "date",
    "is_blocked" boolean DEFAULT false NOT NULL,
    "blocked_reason" "text",
    "blocked_at" timestamp with time zone,
    "is_anonymized" boolean DEFAULT false NOT NULL,
    "anonymized_at" timestamp with time zone,
    "is_merged_into" "uuid",
    "merged_at" timestamp with time zone,
    "consent" "jsonb" DEFAULT "jsonb_build_object"('marketing', "jsonb_build_object"('granted_at', NULL::"unknown", 'source', NULL::"unknown", 'version', NULL::"unknown"), 'transactional', "jsonb_build_object"('granted_at', NULL::"unknown", 'source', NULL::"unknown", 'version', NULL::"unknown"), 'profiling', "jsonb_build_object"('granted_at', NULL::"unknown", 'source', NULL::"unknown", 'version', NULL::"unknown")) NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid",
    "last_activity_at" timestamp with time zone,
    "force_human" boolean DEFAULT false NOT NULL,
    CONSTRAINT "contacts_anonymized_locked" CHECK ((("is_anonymized" = false) OR (("is_anonymized" = true) AND ("anonymized_at" IS NOT NULL)))),
    CONSTRAINT "contacts_cpf_consistency" CHECK ((("cpf_encrypted" IS NULL) = ("cpf_hash" IS NULL))),
    CONSTRAINT "contacts_email_format" CHECK ((("email" IS NULL) OR ("email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text"))),
    CONSTRAINT "contacts_phone_e164_format" CHECK ((("phone_number" IS NULL) OR ("phone_number" ~ '^\+\d{8,15}$'::"text")))
);

CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "channel_session_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "status_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_to_user_id" "uuid",
    "assigned_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "last_outbound_at" timestamp with time zone,
    "last_message_at" timestamp with time zone,
    "last_message_preview" "text",
    "unread_count_for_assignee" integer DEFAULT 0 NOT NULL,
    "is_group" boolean DEFAULT false NOT NULL,
    "group_chat_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bot_silenced_until" timestamp with time zone,
    "last_handoff_at" timestamp with time zone,
    "last_handoff_reason" "text",
    "usable_for_rag" boolean DEFAULT false NOT NULL,
    "usable_for_rag_marked_at" timestamp with time zone,
    "usable_for_rag_marked_by" "uuid",
    "rag_review_status" "text",
    CONSTRAINT "conversations_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "conversations_rag_review_status_check" CHECK ((("rag_review_status" IS NULL) OR ("rag_review_status" = ANY (ARRAY['pending_review'::"text", 'ingested'::"text", 'skipped'::"text"])))),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'pending'::"text", 'resolved'::"text", 'claimed'::"text", 'ai_handling'::"text", 'closed'::"text", 'archived'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."crm_lead_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "source_module" "text" NOT NULL,
    "source_id" "uuid",
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "performed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "performed_by_user_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."crm_lead_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "target_kind" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "link_kind" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid",
    CONSTRAINT "crm_lead_links_target_kind_enum" CHECK (("target_kind" = ANY (ARRAY['order'::"text", 'conversation'::"text", 'message'::"text", 'appointment'::"text", 'contact'::"text", 'lead'::"text", 'external'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "lost_reason" "text",
    "position_in_stage" numeric DEFAULT 1000 NOT NULL,
    "value_cents" bigint,
    "currency" "text" DEFAULT 'XAF'::"text",
    "owner_user_id" "uuid",
    "assigned_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "expected_close_date" "date",
    "closed_at" timestamp with time zone,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_id" "text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid",
    CONSTRAINT "crm_leads_closed_at_consistency" CHECK (((("status" = 'open'::"text") AND ("closed_at" IS NULL)) OR (("status" = ANY (ARRAY['won'::"text", 'lost'::"text"])) AND ("closed_at" IS NOT NULL)))),
    CONSTRAINT "crm_leads_currency_iso" CHECK ((("currency" IS NULL) OR ("currency" ~ '^[A-Z]{3}$'::"text"))),
    CONSTRAINT "crm_leads_lost_reason_required" CHECK ((("status" <> 'lost'::"text") OR (("lost_reason" IS NOT NULL) AND ("length"("lost_reason") > 0)))),
    CONSTRAINT "crm_leads_status_enum" CHECK (("status" = ANY (ARRAY['open'::"text", 'won'::"text", 'lost'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."crm_pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "position" numeric DEFAULT 1000 NOT NULL,
    "vocabulary" "jsonb" DEFAULT "jsonb_build_object"('lead', 'Cliente', 'lead_plural', 'Clientes', 'deal', 'Pedido', 'deal_plural', 'Pedidos', 'won', 'Pago', 'lost', 'Cancelado', 'stage', 'Etapa', 'stage_plural', 'Etapas') NOT NULL,
    "settings" "jsonb" DEFAULT "jsonb_build_object"('fields', '[]'::"jsonb", 'canonical_tags', '[]'::"jsonb", 'lost_reasons', '[]'::"jsonb", 'identity_resolution', "jsonb_build_object"('fields_in_priority_order', "jsonb_build_array"('cpf', 'phone_e164', 'email'))) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_pipelines_slug_format" CHECK (("slug" ~ '^[a-z0-9_-]{2,40}$'::"text"))
);

CREATE TABLE IF NOT EXISTS "public"."crm_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "position" numeric NOT NULL,
    "color" "text",
    "is_won" boolean DEFAULT false NOT NULL,
    "is_lost" boolean DEFAULT false NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "expected_duration_hours" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_human" boolean DEFAULT false NOT NULL,
    CONSTRAINT "crm_stages_color_format" CHECK ((("color" IS NULL) OR ("color" ~ '^#[0-9a-fA-F]{6}$'::"text"))),
    CONSTRAINT "crm_stages_slug_format" CHECK (("slug" ~ '^[a-z0-9_-]{2,40}$'::"text")),
    CONSTRAINT "crm_stages_won_lost_mutex" CHECK ((NOT ("is_won" AND "is_lost")))
);

CREATE TABLE IF NOT EXISTS "public"."event_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_kind" "text" NOT NULL,
    "entity_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "consumed_by" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "event_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'dead'::"text"]))),
    CONSTRAINT "event_type_format" CHECK (("event_type" ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'::"text"))
);

CREATE TABLE IF NOT EXISTS "public"."idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "request_hash" "bytea" NOT NULL,
    "status_code" integer NOT NULL,
    "response_body" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "acknowledged_by" "uuid",
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "incidents_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"]))),
    CONSTRAINT "incidents_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'acknowledged'::"text", 'resolved'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."lgpd_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "contact_id" "uuid",
    "external_customer_id" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb",
    "error_message" "text",
    "cascaded_to" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emergency" boolean DEFAULT false NOT NULL,
    "scope" "text" DEFAULT 'contact'::"text" NOT NULL,
    CONSTRAINT "lgpd_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['data_request'::"text", 'redact'::"text", 'store_redact'::"text"]))),
    CONSTRAINT "lgpd_requests_scope_check" CHECK (("scope" = ANY (ARRAY['contact'::"text", 'tenant'::"text"]))),
    CONSTRAINT "lgpd_requests_source_check" CHECK (("source" = ANY (ARRAY['nuvemshop'::"text", 'manual'::"text", 'api'::"text", 'support'::"text"]))),
    CONSTRAINT "lgpd_requests_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'expired'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."merge_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "candidates" "uuid"[] NOT NULL,
    "reason" "text" NOT NULL,
    "trigger_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolution" "jsonb",
    "resolved_by_user_id" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "merge_queue_candidates_min2" CHECK (("array_length"("candidates", 1) >= 2)),
    CONSTRAINT "merge_queue_status_enum" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text", 'discarded'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "channel_session_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "external_id" "text",
    "type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "ack" integer,
    "error_code" "text",
    "error_message" "text",
    "body" "text",
    "media_url" "text",
    "media_mime" "text",
    "media_size_bytes" bigint,
    "media_storage_path" "text",
    "sent_via" "text" DEFAULT 'crm'::"text" NOT NULL,
    "sent_by_user_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "activity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "messages_sent_via_check" CHECK (("sent_via" = ANY (ARRAY['crm'::"text", 'external_device'::"text", 'automation'::"text", 'ai'::"text", 'user'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'received'::"text", 'sending'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"]))),
    CONSTRAINT "messages_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'video'::"text", 'audio'::"text", 'document'::"text", 'sticker'::"text", 'location'::"text", 'contact'::"text", 'reaction'::"text", 'system'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."nuvemshop_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price_cents" bigint NOT NULL,
    "available_qty" integer DEFAULT 0 NOT NULL,
    "url" "text",
    "image_url" "text",
    "rag_indexed_at" timestamp with time zone,
    "rag_chunk_count" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_updated_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nuvemshop_products_price_cents_check" CHECK (("price_cents" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "external_id" "text" NOT NULL,
    "external_provider" "text" NOT NULL,
    "customer_external_id" "text",
    "contact_id" "uuid",
    "status" "text" NOT NULL,
    "total_cents" bigint NOT NULL,
    "currency" character(3) DEFAULT 'XAF'::"bpchar" NOT NULL,
    "payment_method" "text",
    "fulfillment_status" "text",
    "tracking_code" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ordered_at" timestamp with time zone NOT NULL,
    "updated_at_remote" timestamp with time zone,
    "is_anonymized" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orders_external_provider_check" CHECK (("external_provider" = ANY (ARRAY['nuvemshop'::"text", 'vtex'::"text", 'shopify'::"text"]))),
    CONSTRAINT "orders_fulfillment_status_check" CHECK (("fulfillment_status" = ANY (ARRAY['unpacked'::"text", 'packed'::"text", 'shipped'::"text", 'delivered'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text", 'fulfilled'::"text", 'shipped'::"text", 'delivered'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_total_cents_check" CHECK (("total_cents" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "public"."citext" NOT NULL,
    "legal_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "cnpj" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Douala'::"text" NOT NULL,
    "locale" "text" DEFAULT 'fr-FR'::"text" NOT NULL,
    "rate_limit_rps" integer DEFAULT 100 NOT NULL,
    "ai_budget_cents" bigint,
    "media_retention_days" integer DEFAULT 365 NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "dpo_email" "public"."citext",
    "privacy_policy_url" "text",
    "onboarded_at" timestamp with time zone,
    "suspended_at" timestamp with time zone,
    "redacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "onboarding_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "suspended_reason" "text",
    "suspended_by" "uuid",
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'redacted'::"text", 'archived'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "user_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope" "text" DEFAULT 'full'::"text" NOT NULL,
    "mfa_required" boolean DEFAULT true NOT NULL,
    "reason" "text" NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revoke_reason" "text",
    CONSTRAINT "platform_admins_scope_check" CHECK (("scope" = ANY (ARRAY['full'::"text", 'support_readonly'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."storage_redaction_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "bucket" "text" NOT NULL,
    "object_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "enqueued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "storage_redaction_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'deleted'::"text", 'failed'::"text", 'skipped'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."tenant_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "oauth_access_token_encrypted" "bytea" NOT NULL,
    "oauth_refresh_token_encrypted" "bytea",
    "scopes" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'connecting'::"text" NOT NULL,
    "status_reason" "text",
    "store_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "webhook_path_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(24), 'hex'::"text") NOT NULL,
    "webhook_secret_encrypted" "bytea" NOT NULL,
    "webhook_subscriptions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_health_check_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_integrations_provider_check" CHECK (("provider" = ANY (ARRAY['nuvemshop'::"text", 'vtex'::"text", 'shopify'::"text"]))),
    CONSTRAINT "tenant_integrations_status_check" CHECK (("status" = ANY (ARRAY['connecting'::"text", 'healthy'::"text", 'token_expired'::"text", 'scope_missing'::"text", 'disconnected'::"text", 'rate_limited'::"text", 'error'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_organizations_role_check" CHECK (("role" = ANY (ARRAY['viewer'::"text", 'agent'::"text", 'manager'::"text", 'admin'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_recovery_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "bytea" NOT NULL,
    "used_at" timestamp with time zone,
    "used_ip" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."webhook_events_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "channel_session_id" "uuid",
    "provider" "text" DEFAULT 'waha'::"text" NOT NULL,
    "webhook_path_token" "text",
    "http_method" "text" DEFAULT 'POST'::"text" NOT NULL,
    "headers" "jsonb",
    "raw_body" "text" NOT NULL,
    "payload_parsed" "jsonb",
    "signature_header" "text",
    "valid_signature" boolean,
    "event_type" "text",
    "external_id" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "processed_at" timestamp with time zone,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "webhook_events_log_provider_check" CHECK (("provider" = ANY (ARRAY['waha'::"text", 'nuvemshop'::"text", 'generic'::"text"]))),
    CONSTRAINT "webhook_events_log_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'error'::"text", 'dead'::"text"])))
);

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_pkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_pkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_unique_number' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_unique_number"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_unique_number" UNIQUE ("agent_id", "version_number");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agents_name_unique' AND conrelid = '"public"."ai_agents"'::regclass)
   AND to_regclass('"public"."ai_agents_name_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_name_unique" UNIQUE ("organization_id", "name");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agents_pkey' AND conrelid = '"public"."ai_agents"'::regclass)
   AND to_regclass('"public"."ai_agents_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_budgets_pkey' AND conrelid = '"public"."ai_budgets"'::regclass)
   AND to_regclass('"public"."ai_budgets_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_budgets"
    ADD CONSTRAINT "ai_budgets_pkey" PRIMARY KEY ("organization_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_chunks_pkey' AND conrelid = '"public"."ai_chunks"'::regclass)
   AND to_regclass('"public"."ai_chunks_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_chunks"
    ADD CONSTRAINT "ai_chunks_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_chunks_position_unique' AND conrelid = '"public"."ai_chunks"'::regclass)
   AND to_regclass('"public"."ai_chunks_position_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_chunks"
    ADD CONSTRAINT "ai_chunks_position_unique" UNIQUE ("knowledge_source_id", "kb_version_id", "position");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_faq_items_pkey' AND conrelid = '"public"."ai_faq_items"'::regclass)
   AND to_regclass('"public"."ai_faq_items_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_faq_items"
    ADD CONSTRAINT "ai_faq_items_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_invocations_pkey' AND conrelid = '"public"."ai_invocations"'::regclass)
   AND to_regclass('"public"."ai_invocations_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_kbv_version_unique' AND conrelid = '"public"."ai_knowledge_versions"'::regclass)
   AND to_regclass('"public"."ai_kbv_version_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_versions"
    ADD CONSTRAINT "ai_kbv_version_unique" UNIQUE ("agent_id", "version_number");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_sources_pkey' AND conrelid = '"public"."ai_knowledge_sources"'::regclass)
   AND to_regclass('"public"."ai_knowledge_sources_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_sources"
    ADD CONSTRAINT "ai_knowledge_sources_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_versions_pkey' AND conrelid = '"public"."ai_knowledge_versions"'::regclass)
   AND to_regclass('"public"."ai_knowledge_versions_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_versions"
    ADD CONSTRAINT "ai_knowledge_versions_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_models_pkey' AND conrelid = '"public"."ai_models"'::regclass)
   AND to_regclass('"public"."ai_models_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_models"
    ADD CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_models_unique' AND conrelid = '"public"."ai_models"'::regclass)
   AND to_regclass('"public"."ai_models_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_models"
    ADD CONSTRAINT "ai_models_unique" UNIQUE ("provider", "model_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_pricing_pkey' AND conrelid = '"public"."ai_pricing"'::regclass)
   AND to_regclass('"public"."ai_pricing_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_pricing"
    ADD CONSTRAINT "ai_pricing_pkey" PRIMARY KEY ("model");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_provider_credentials_pkey' AND conrelid = '"public"."ai_provider_credentials"'::regclass)
   AND to_regclass('"public"."ai_provider_credentials_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_provider_credentials_unique' AND conrelid = '"public"."ai_provider_credentials"'::regclass)
   AND to_regclass('"public"."ai_provider_credentials_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_unique" UNIQUE ("organization_id", "provider", "label");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_audit_log_pkey' AND conrelid = '"public"."api_audit_log"'::regclass)
   AND to_regclass('"public"."api_audit_log_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_audit_log"
    ADD CONSTRAINT "api_audit_log_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_tokens_organization_id_prefix_key' AND conrelid = '"public"."api_tokens"'::regclass)
   AND to_regclass('"public"."api_tokens_organization_id_prefix_key"') IS NULL THEN
ALTER TABLE ONLY "public"."api_tokens"
    ADD CONSTRAINT "api_tokens_organization_id_prefix_key" UNIQUE ("organization_id", "prefix");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_tokens_pkey' AND conrelid = '"public"."api_tokens"'::regclass)
   AND to_regclass('"public"."api_tokens_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_tokens"
    ADD CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_session_warmup_pkey' AND conrelid = '"public"."channel_session_warmup"'::regclass)
   AND to_regclass('"public"."channel_session_warmup_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_session_warmup"
    ADD CONSTRAINT "channel_session_warmup_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_phone_per_org_unique' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_phone_per_org_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_phone_per_org_unique" UNIQUE ("organization_id", "phone_number") DEFERRABLE INITIALLY DEFERRED;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_pkey' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_waha_session_name_unique' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_waha_session_name_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_waha_session_name_unique" UNIQUE ("waha_session_name");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_webhook_path_token_unique' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_webhook_path_token_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_webhook_path_token_unique" UNIQUE ("webhook_path_token");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'contacts_pkey' AND conrelid = '"public"."contacts"'::regclass)
   AND to_regclass('"public"."contacts_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_pkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_unique_per_contact_session' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_unique_per_contact_session"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_unique_per_contact_session" UNIQUE ("organization_id", "contact_id", "channel_session_id", "group_chat_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_activities_pkey' AND conrelid = '"public"."crm_lead_activities"'::regclass)
   AND to_regclass('"public"."crm_lead_activities_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_links_pkey' AND conrelid = '"public"."crm_lead_links"'::regclass)
   AND to_regclass('"public"."crm_lead_links_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_links"
    ADD CONSTRAINT "crm_lead_links_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_leads_pkey' AND conrelid = '"public"."crm_leads"'::regclass)
   AND to_regclass('"public"."crm_leads_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_pipelines_pkey' AND conrelid = '"public"."crm_pipelines"'::regclass)
   AND to_regclass('"public"."crm_pipelines_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_stages_pkey' AND conrelid = '"public"."crm_stages"'::regclass)
   AND to_regclass('"public"."crm_stages_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_stages"
    ADD CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'event_log_pkey' AND conrelid = '"public"."event_log"'::regclass)
   AND to_regclass('"public"."event_log_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."event_log"
    ADD CONSTRAINT "event_log_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'idempotency_keys_organization_id_key_endpoint_key' AND conrelid = '"public"."idempotency_keys"'::regclass)
   AND to_regclass('"public"."idempotency_keys_organization_id_key_endpoint_key"') IS NULL THEN
ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_organization_id_key_endpoint_key" UNIQUE ("organization_id", "key", "endpoint");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'idempotency_keys_pkey' AND conrelid = '"public"."idempotency_keys"'::regclass)
   AND to_regclass('"public"."idempotency_keys_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'incidents_pkey' AND conrelid = '"public"."incidents"'::regclass)
   AND to_regclass('"public"."incidents_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'lgpd_requests_pkey' AND conrelid = '"public"."lgpd_requests"'::regclass)
   AND to_regclass('"public"."lgpd_requests_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."lgpd_requests"
    ADD CONSTRAINT "lgpd_requests_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'merge_queue_pkey' AND conrelid = '"public"."merge_queue"'::regclass)
   AND to_regclass('"public"."merge_queue_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."merge_queue"
    ADD CONSTRAINT "merge_queue_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_org_external_id_unique' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_org_external_id_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_org_external_id_unique" UNIQUE ("organization_id", "external_id") DEFERRABLE INITIALLY DEFERRED;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_pkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'nuvemshop_products_organization_id_external_id_key' AND conrelid = '"public"."nuvemshop_products"'::regclass)
   AND to_regclass('"public"."nuvemshop_products_organization_id_external_id_key"') IS NULL THEN
ALTER TABLE ONLY "public"."nuvemshop_products"
    ADD CONSTRAINT "nuvemshop_products_organization_id_external_id_key" UNIQUE ("organization_id", "external_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'nuvemshop_products_pkey' AND conrelid = '"public"."nuvemshop_products"'::regclass)
   AND to_regclass('"public"."nuvemshop_products_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."nuvemshop_products"
    ADD CONSTRAINT "nuvemshop_products_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'orders_organization_id_external_provider_external_id_key' AND conrelid = '"public"."orders"'::regclass)
   AND to_regclass('"public"."orders_organization_id_external_provider_external_id_key"') IS NULL THEN
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_external_provider_external_id_key" UNIQUE ("organization_id", "external_provider", "external_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'orders_pkey' AND conrelid = '"public"."orders"'::regclass)
   AND to_regclass('"public"."orders_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'organizations_cnpj_key' AND conrelid = '"public"."organizations"'::regclass)
   AND to_regclass('"public"."organizations_cnpj_key"') IS NULL THEN
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_cnpj_key" UNIQUE ("cnpj");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'organizations_pkey' AND conrelid = '"public"."organizations"'::regclass)
   AND to_regclass('"public"."organizations_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'organizations_slug_key' AND conrelid = '"public"."organizations"'::regclass)
   AND to_regclass('"public"."organizations_slug_key"') IS NULL THEN
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'platform_admins_pkey' AND conrelid = '"public"."platform_admins"'::regclass)
   AND to_regclass('"public"."platform_admins_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'storage_redaction_queue_bucket_object_path_key' AND conrelid = '"public"."storage_redaction_queue"'::regclass)
   AND to_regclass('"public"."storage_redaction_queue_bucket_object_path_key"') IS NULL THEN
ALTER TABLE ONLY "public"."storage_redaction_queue"
    ADD CONSTRAINT "storage_redaction_queue_bucket_object_path_key" UNIQUE ("bucket", "object_path");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'storage_redaction_queue_pkey' AND conrelid = '"public"."storage_redaction_queue"'::regclass)
   AND to_regclass('"public"."storage_redaction_queue_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."storage_redaction_queue"
    ADD CONSTRAINT "storage_redaction_queue_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'tenant_integrations_organization_id_provider_key' AND conrelid = '"public"."tenant_integrations"'::regclass)
   AND to_regclass('"public"."tenant_integrations_organization_id_provider_key"') IS NULL THEN
ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_organization_id_provider_key" UNIQUE ("organization_id", "provider");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'tenant_integrations_pkey' AND conrelid = '"public"."tenant_integrations"'::regclass)
   AND to_regclass('"public"."tenant_integrations_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_organizations_pkey' AND conrelid = '"public"."user_organizations"'::regclass)
   AND to_regclass('"public"."user_organizations_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_organizations_user_id_organization_id_key' AND conrelid = '"public"."user_organizations"'::regclass)
   AND to_regclass('"public"."user_organizations_user_id_organization_id_key"') IS NULL THEN
ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_recovery_codes_pkey' AND conrelid = '"public"."user_recovery_codes"'::regclass)
   AND to_regclass('"public"."user_recovery_codes_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_recovery_codes"
    ADD CONSTRAINT "user_recovery_codes_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'warmup_session_day_unique' AND conrelid = '"public"."channel_session_warmup"'::regclass)
   AND to_regclass('"public"."warmup_session_day_unique"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_session_warmup"
    ADD CONSTRAINT "warmup_session_day_unique" UNIQUE ("channel_session_id", "day");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'webhook_events_log_pkey' AND conrelid = '"public"."webhook_events_log"'::regclass)
   AND to_regclass('"public"."webhook_events_log_pkey"') IS NULL THEN
ALTER TABLE ONLY "public"."webhook_events_log"
    ADD CONSTRAINT "webhook_events_log_pkey" PRIMARY KEY ("id");
END IF; END $baseline_guard$;

CREATE INDEX IF NOT EXISTS "ai_agent_runs_agent_idx" ON "public"."ai_agent_runs" USING "btree" ("agent_id", "started_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_agent_runs_one_running_per_conv" ON "public"."ai_agent_runs" USING "btree" ("conversation_id") WHERE (("status" = 'running'::"text") AND ("is_dry_run" = false));

CREATE INDEX IF NOT EXISTS "ai_agent_runs_org_started_idx" ON "public"."ai_agent_runs" USING "btree" ("organization_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_agent_runs_status_idx" ON "public"."ai_agent_runs" USING "btree" ("status", "started_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"]));

CREATE INDEX IF NOT EXISTS "ai_agent_versions_agent_idx" ON "public"."ai_agent_versions" USING "btree" ("agent_id", "version_number" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_agents_one_default_per_org" ON "public"."ai_agents" USING "btree" ("organization_id") WHERE "is_default";

CREATE INDEX IF NOT EXISTS "ai_agents_org_active_idx" ON "public"."ai_agents" USING "btree" ("organization_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "ai_agents_published_idx" ON "public"."ai_agents" USING "btree" ("organization_id", "priority" DESC) WHERE (("published_version_id" IS NOT NULL) AND ("archived_at" IS NULL));

CREATE INDEX IF NOT EXISTS "ai_chunks_embedding_ivfflat_idx" ON "public"."ai_chunks" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');

CREATE INDEX IF NOT EXISTS "ai_chunks_metadata_gin_idx" ON "public"."ai_chunks" USING "gin" ("metadata");

CREATE INDEX IF NOT EXISTS "ai_chunks_org_kbv_idx" ON "public"."ai_chunks" USING "btree" ("organization_id", "kb_version_id");

CREATE INDEX IF NOT EXISTS "ai_chunks_source_idx" ON "public"."ai_chunks" USING "btree" ("knowledge_source_id");

CREATE INDEX IF NOT EXISTS "ai_faq_items_org_idx" ON "public"."ai_faq_items" USING "btree" ("organization_id");

CREATE INDEX IF NOT EXISTS "ai_faq_items_source_idx" ON "public"."ai_faq_items" USING "btree" ("knowledge_source_id", "position");

CREATE INDEX IF NOT EXISTS "ai_invocations_agent_kind_idx" ON "public"."ai_invocations" USING "btree" ("agent_id", "invocation_kind");

CREATE INDEX IF NOT EXISTS "ai_invocations_conversation_idx" ON "public"."ai_invocations" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "ai_invocations_org_created_idx" ON "public"."ai_invocations" USING "btree" ("organization_id", "created_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_kbv_one_active_per_agent" ON "public"."ai_knowledge_versions" USING "btree" ("agent_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "ai_knowledge_sources_agent_idx" ON "public"."ai_knowledge_sources" USING "btree" ("agent_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_knowledge_sources_unique_per_agent" ON "public"."ai_knowledge_sources" USING "btree" ("agent_id", "source_type") WHERE "is_active";

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_one_default_per_provider" ON "public"."ai_models" USING "btree" ("provider") WHERE "is_default_for_provider";

CREATE INDEX IF NOT EXISTS "ai_provider_credentials_org_provider_idx" ON "public"."ai_provider_credentials" USING "btree" ("organization_id", "provider") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "conversations_bot_silenced_idx" ON "public"."conversations" USING "btree" ("bot_silenced_until") WHERE ("bot_silenced_until" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "conversations_usable_rag_idx" ON "public"."conversations" USING "btree" ("organization_id", "usable_for_rag", "usable_for_rag_marked_at") WHERE ("usable_for_rag" = true);

CREATE INDEX IF NOT EXISTS "event_log_consumed_by_gin" ON "public"."event_log" USING "gin" ("consumed_by");

CREATE INDEX IF NOT EXISTS "event_log_dead_idx" ON "public"."event_log" USING "btree" ("organization_id", "created_at" DESC) WHERE ("status" = 'dead'::"text");

CREATE INDEX IF NOT EXISTS "event_log_entity_idx" ON "public"."event_log" USING "btree" ("entity_kind", "entity_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "event_log_org_type_idx" ON "public"."event_log" USING "btree" ("organization_id", "event_type", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "event_log_pending_idx" ON "public"."event_log" USING "btree" ("organization_id", "created_at") WHERE ("status" = 'pending'::"text");

CREATE INDEX IF NOT EXISTS "idx_api_tokens_hash" ON "public"."api_tokens" USING "btree" ("token_hash") WHERE ("revoked_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_api_tokens_org" ON "public"."api_tokens" USING "btree" ("organization_id") WHERE ("revoked_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_audit_action_time" ON "public"."api_audit_log" USING "btree" ("action", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_actor_time" ON "public"."api_audit_log" USING "btree" ("actor_user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_org_time" ON "public"."api_audit_log" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_request" ON "public"."api_audit_log" USING "btree" ("request_id");

CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "public"."api_audit_log" USING "btree" ("resource_type", "resource_id");

CREATE INDEX IF NOT EXISTS "idx_channel_sessions_health" ON "public"."channel_sessions" USING "btree" ("last_health_check_at") WHERE ("status" = 'WORKING'::"text");

CREATE INDEX IF NOT EXISTS "idx_channel_sessions_org_status" ON "public"."channel_sessions" USING "btree" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "idx_contacts_consent_gin" ON "public"."contacts" USING "gin" ("consent" "jsonb_path_ops");

CREATE INDEX IF NOT EXISTS "idx_contacts_org_blocked" ON "public"."contacts" USING "btree" ("organization_id") WHERE ("is_blocked" = true);

CREATE INDEX IF NOT EXISTS "idx_contacts_org_last_activity" ON "public"."contacts" USING "btree" ("organization_id", "last_activity_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "idx_contacts_org_name_trgm" ON "public"."contacts" USING "gin" ("name" "public"."gin_trgm_ops");

CREATE INDEX IF NOT EXISTS "idx_contacts_tags_gin" ON "public"."contacts" USING "gin" ("tags");

CREATE INDEX IF NOT EXISTS "idx_conversations_assigned" ON "public"."conversations" USING "btree" ("assigned_to_user_id", "status") WHERE ("assigned_to_user_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_conversations_open_unassigned" ON "public"."conversations" USING "btree" ("organization_id", "last_inbound_at" DESC) WHERE (("status" = 'open'::"text") AND ("assigned_to_user_id" IS NULL));

CREATE INDEX IF NOT EXISTS "idx_conversations_org_last_msg" ON "public"."conversations" USING "btree" ("organization_id", "last_message_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "idx_crm_lead_links_lead" ON "public"."crm_lead_links" USING "btree" ("lead_id");

CREATE INDEX IF NOT EXISTS "idx_crm_lead_links_org_target" ON "public"."crm_lead_links" USING "btree" ("organization_id", "target_kind", "target_id");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_custom_fields_gin" ON "public"."crm_leads" USING "gin" ("custom_fields" "jsonb_path_ops");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_contact" ON "public"."crm_leads" USING "btree" ("organization_id", "contact_id");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_expected_close_overdue" ON "public"."crm_leads" USING "btree" ("organization_id", "expected_close_date") WHERE (("status" = 'open'::"text") AND ("expected_close_date" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_last_activity" ON "public"."crm_leads" USING "btree" ("organization_id", "last_activity_at" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_owner_status" ON "public"."crm_leads" USING "btree" ("organization_id", "owner_user_id", "status") WHERE ("status" = 'open'::"text");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_pipeline_status" ON "public"."crm_leads" USING "btree" ("organization_id", "pipeline_id", "status");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_org_stage_position" ON "public"."crm_leads" USING "btree" ("organization_id", "stage_id", "position_in_stage");

CREATE INDEX IF NOT EXISTS "idx_crm_leads_tags_gin" ON "public"."crm_leads" USING "gin" ("tags");

CREATE INDEX IF NOT EXISTS "idx_crm_pipelines_org_position" ON "public"."crm_pipelines" USING "btree" ("organization_id", "position") WHERE ("is_archived" = false);

CREATE INDEX IF NOT EXISTS "idx_crm_stages_pipeline_position" ON "public"."crm_stages" USING "btree" ("pipeline_id", "position") WHERE ("is_archived" = false);

CREATE INDEX IF NOT EXISTS "idx_idem_expiry" ON "public"."idempotency_keys" USING "btree" ("expires_at");

CREATE INDEX IF NOT EXISTS "idx_idem_lookup" ON "public"."idempotency_keys" USING "btree" ("organization_id", "key", "endpoint");

CREATE INDEX IF NOT EXISTS "idx_lead_activities_org_contact" ON "public"."crm_lead_activities" USING "btree" ("organization_id", "contact_id", "performed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_lead_activities_org_lead_perf" ON "public"."crm_lead_activities" USING "btree" ("organization_id", "lead_id", "performed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_lead_activities_org_type_perf" ON "public"."crm_lead_activities" USING "btree" ("organization_id", "type", "performed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_lead_activities_payload_gin" ON "public"."crm_lead_activities" USING "gin" ("payload" "jsonb_path_ops");

CREATE INDEX IF NOT EXISTS "idx_merge_queue_org_status" ON "public"."merge_queue" USING "btree" ("organization_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_messages_conversation_sent" ON "public"."messages" USING "btree" ("conversation_id", "sent_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_messages_external_lookup" ON "public"."messages" USING "btree" ("organization_id", "external_id") WHERE ("external_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_messages_org_status_created" ON "public"."messages" USING "btree" ("organization_id", "status", "created_at") WHERE ("status" = ANY (ARRAY['sending'::"text", 'failed'::"text"]));

CREATE INDEX IF NOT EXISTS "idx_organizations_pending_onboarding" ON "public"."organizations" USING "btree" ("id") WHERE ("onboarded_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_orgs_slug" ON "public"."organizations" USING "btree" ("slug");

CREATE INDEX IF NOT EXISTS "idx_orgs_status" ON "public"."organizations" USING "btree" ("status") WHERE ("status" = 'active'::"text");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_recovery_unique" ON "public"."user_recovery_codes" USING "btree" ("user_id", "code_hash");

CREATE INDEX IF NOT EXISTS "idx_recovery_user" ON "public"."user_recovery_codes" USING "btree" ("user_id") WHERE ("used_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_user_orgs_org_role" ON "public"."user_organizations" USING "btree" ("organization_id", "role") WHERE ("revoked_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_user_orgs_user" ON "public"."user_organizations" USING "btree" ("user_id") WHERE ("revoked_at" IS NULL);

CREATE INDEX IF NOT EXISTS "idx_warmup_org_day" ON "public"."channel_session_warmup" USING "btree" ("organization_id", "day" DESC);

CREATE INDEX IF NOT EXISTS "idx_webhook_events_external_id" ON "public"."webhook_events_log" USING "btree" ("organization_id", "provider", "external_id") WHERE ("external_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_webhook_events_org_received" ON "public"."webhook_events_log" USING "btree" ("organization_id", "received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_webhook_events_status_received" ON "public"."webhook_events_log" USING "btree" ("status", "received_at") WHERE ("status" = ANY (ARRAY['received'::"text", 'error'::"text"]));

CREATE INDEX IF NOT EXISTS "incidents_org_idx" ON "public"."incidents" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "incidents_severity_idx" ON "public"."incidents" USING "btree" ("severity", "status");

CREATE INDEX IF NOT EXISTS "incidents_status_idx" ON "public"."incidents" USING "btree" ("status", "created_at" DESC) WHERE ("status" <> 'resolved'::"text");

CREATE INDEX IF NOT EXISTS "lgpd_requests_contact_idx" ON "public"."lgpd_requests" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "lgpd_requests_emergency_idx" ON "public"."lgpd_requests" USING "btree" ("organization_id", "emergency", "due_at") WHERE ("emergency" = true);

CREATE INDEX IF NOT EXISTS "lgpd_requests_org_due_idx" ON "public"."lgpd_requests" USING "btree" ("organization_id", "due_at") WHERE ("status" = ANY (ARRAY['received'::"text", 'processing'::"text"]));

CREATE INDEX IF NOT EXISTS "lgpd_requests_org_status_idx" ON "public"."lgpd_requests" USING "btree" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "nuvemshop_products_org_idx" ON "public"."nuvemshop_products" USING "btree" ("organization_id");

CREATE INDEX IF NOT EXISTS "nuvemshop_products_rag_pending_idx" ON "public"."nuvemshop_products" USING "btree" ("organization_id") WHERE ("rag_indexed_at" IS NULL);

CREATE INDEX IF NOT EXISTS "nuvemshop_products_title_trgm" ON "public"."nuvemshop_products" USING "gin" ("title" "public"."gin_trgm_ops");

CREATE INDEX IF NOT EXISTS "orders_contact_idx" ON "public"."orders" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "orders_customer_external_idx" ON "public"."orders" USING "btree" ("organization_id", "external_provider", "customer_external_id");

CREATE INDEX IF NOT EXISTS "orders_org_ordered_idx" ON "public"."orders" USING "btree" ("organization_id", "ordered_at" DESC);

CREATE INDEX IF NOT EXISTS "orders_payload_gin" ON "public"."orders" USING "gin" ("payload" "jsonb_path_ops");

CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "public"."orders" USING "btree" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "storage_redaction_queue_org_idx" ON "public"."storage_redaction_queue" USING "btree" ("organization_id");

CREATE INDEX IF NOT EXISTS "storage_redaction_queue_status_idx" ON "public"."storage_redaction_queue" USING "btree" ("status", "enqueued_at") WHERE ("status" = 'pending'::"text");

CREATE INDEX IF NOT EXISTS "tenant_integrations_expires_idx" ON "public"."tenant_integrations" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "tenant_integrations_org_idx" ON "public"."tenant_integrations" USING "btree" ("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_integrations_path_token_idx" ON "public"."tenant_integrations" USING "btree" ("webhook_path_token");

CREATE INDEX IF NOT EXISTS "tenant_integrations_status_idx" ON "public"."tenant_integrations" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['token_expired'::"text", 'error'::"text"]));

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_contacts_org_cpf" ON "public"."contacts" USING "btree" ("organization_id", "cpf_hash") WHERE (("cpf_hash" IS NOT NULL) AND ("is_merged_into" IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_contacts_org_email" ON "public"."contacts" USING "btree" ("organization_id", "email_normalized") WHERE (("email_normalized" IS NOT NULL) AND ("is_merged_into" IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_contacts_org_phone" ON "public"."contacts" USING "btree" ("organization_id", "phone_number") WHERE (("phone_number" IS NOT NULL) AND ("is_merged_into" IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_lead_links_lead_target_link" ON "public"."crm_lead_links" USING "btree" ("lead_id", "target_kind", "target_id", "link_kind");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_leads_org_source_external" ON "public"."crm_leads" USING "btree" ("organization_id", "source", "external_id") WHERE ("external_id" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_pipelines_org_default" ON "public"."crm_pipelines" USING "btree" ("organization_id") WHERE ("is_default" = true);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_pipelines_org_slug" ON "public"."crm_pipelines" USING "btree" ("organization_id", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_stages_pipeline_lost" ON "public"."crm_stages" USING "btree" ("pipeline_id") WHERE (("is_lost" = true) AND ("is_archived" = false));

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_stages_pipeline_slug" ON "public"."crm_stages" USING "btree" ("pipeline_id", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_crm_stages_pipeline_won" ON "public"."crm_stages" USING "btree" ("pipeline_id") WHERE (("is_won" = true) AND ("is_archived" = false));

CREATE INDEX IF NOT EXISTS "webhook_events_log_dlq_idx" ON "public"."webhook_events_log" USING "btree" ("organization_id", "provider") WHERE ("status" = 'dead'::"text");

CREATE INDEX IF NOT EXISTS "webhook_events_log_lgpd_idx" ON "public"."webhook_events_log" USING "btree" ("organization_id", "provider", "event_type", "received_at" DESC) WHERE ("event_type" = ANY (ARRAY['customer/redact'::"text", 'customer/data_request'::"text", 'store/redact'::"text"]));

CREATE OR REPLACE TRIGGER "ai_faq_items_updated_at" BEFORE UPDATE ON "public"."ai_faq_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "incidents_updated_at" BEFORE UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_ai_agent_runs_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_log_row"();

CREATE OR REPLACE TRIGGER "trg_ai_agent_versions_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_agent_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_log_row"();

CREATE OR REPLACE TRIGGER "trg_ai_agents_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_agents" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_log_row"();

CREATE OR REPLACE TRIGGER "trg_ai_agents_updated_at" BEFORE UPDATE ON "public"."ai_agents" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_ai_budgets_updated_at" BEFORE UPDATE ON "public"."ai_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_ai_invocations_budget" AFTER INSERT ON "public"."ai_invocations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_budget_consumption"();

CREATE OR REPLACE TRIGGER "trg_ai_knowledge_sources_updated_at" BEFORE UPDATE ON "public"."ai_knowledge_sources" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_ai_provider_credentials_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."ai_provider_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."fn_audit_log_row"();

CREATE OR REPLACE TRIGGER "trg_api_tokens_touch" BEFORE UPDATE ON "public"."api_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();

CREATE OR REPLACE TRIGGER "trg_channel_sessions_status_audit" AFTER UPDATE OF "status" ON "public"."channel_sessions" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."fn_emit_channel_session_status_changed"();

CREATE OR REPLACE TRIGGER "trg_channel_sessions_updated_at" BEFORE UPDATE ON "public"."channel_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_lead_close_on_stage" BEFORE INSERT OR UPDATE OF "stage_id" ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."fn_crm_lead_close_on_stage"();

CREATE OR REPLACE TRIGGER "trg_crm_leads_updated_at" BEFORE UPDATE ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_pipelines_updated_at" BEFORE UPDATE ON "public"."crm_pipelines" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_crm_stages_updated_at" BEFORE UPDATE ON "public"."crm_stages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_emit_event_on_lead_change" AFTER INSERT OR UPDATE ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."fn_emit_event_on_lead_change"();

CREATE OR REPLACE TRIGGER "trg_event_log_touch" BEFORE UPDATE ON "public"."event_log" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();

CREATE OR REPLACE TRIGGER "trg_lgpd_requests_updated_at" BEFORE UPDATE ON "public"."lgpd_requests" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_messages_emit_event" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_emit_message_event"();

CREATE OR REPLACE TRIGGER "trg_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_nuvemshop_products_updated_at" BEFORE UPDATE ON "public"."nuvemshop_products" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_organizations_touch" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();

CREATE OR REPLACE TRIGGER "trg_seed_default_pipeline_for_org" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_seed_default_pipeline_for_org"();

CREATE OR REPLACE TRIGGER "trg_tenant_integrations_updated_at" BEFORE UPDATE ON "public"."tenant_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

CREATE OR REPLACE TRIGGER "trg_update_last_activity_at" AFTER INSERT ON "public"."crm_lead_activities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_last_activity_at"();

CREATE OR REPLACE TRIGGER "trg_user_orgs_touch" BEFORE UPDATE ON "public"."user_organizations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();

CREATE OR REPLACE TRIGGER "trg_validate_activity_lead_org" BEFORE INSERT ON "public"."crm_lead_activities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_activity_lead_org"();

CREATE OR REPLACE TRIGGER "trg_validate_lost_reason_required" BEFORE INSERT OR UPDATE OF "status", "lost_reason" ON "public"."crm_leads" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_lost_reason_required"();

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_agent_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_agent_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_agent_version_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_agent_version_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_agent_version_id_fkey" FOREIGN KEY ("agent_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_channel_session_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_contact_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_conversation_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_conversation_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_inbound_message_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_inbound_message_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_inbound_message_id_fkey" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_organization_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_runs_outbound_message_id_fkey' AND conrelid = '"public"."ai_agent_runs"'::regclass)
   AND to_regclass('"public"."ai_agent_runs_outbound_message_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_runs"
    ADD CONSTRAINT "ai_agent_runs_outbound_message_id_fkey" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_agent_id_fkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_agent_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_channel_session_id_fkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_created_by_fkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_credential_id_fkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_credential_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."ai_provider_credentials"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agent_versions_organization_id_fkey' AND conrelid = '"public"."ai_agent_versions"'::regclass)
   AND to_regclass('"public"."ai_agent_versions_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agent_versions"
    ADD CONSTRAINT "ai_agent_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agents_created_by_fkey' AND conrelid = '"public"."ai_agents"'::regclass)
   AND to_regclass('"public"."ai_agents_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agents_organization_id_fkey' AND conrelid = '"public"."ai_agents"'::regclass)
   AND to_regclass('"public"."ai_agents_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_agents_published_version_id_fkey' AND conrelid = '"public"."ai_agents"'::regclass)
   AND to_regclass('"public"."ai_agents_published_version_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_agents"
    ADD CONSTRAINT "ai_agents_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "public"."ai_agent_versions"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_budgets_organization_id_fkey' AND conrelid = '"public"."ai_budgets"'::regclass)
   AND to_regclass('"public"."ai_budgets_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_budgets"
    ADD CONSTRAINT "ai_budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_chunks_knowledge_source_id_fkey' AND conrelid = '"public"."ai_chunks"'::regclass)
   AND to_regclass('"public"."ai_chunks_knowledge_source_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_chunks"
    ADD CONSTRAINT "ai_chunks_knowledge_source_id_fkey" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_chunks_organization_id_fkey' AND conrelid = '"public"."ai_chunks"'::regclass)
   AND to_regclass('"public"."ai_chunks_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_chunks"
    ADD CONSTRAINT "ai_chunks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_faq_items_knowledge_source_id_fkey' AND conrelid = '"public"."ai_faq_items"'::regclass)
   AND to_regclass('"public"."ai_faq_items_knowledge_source_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_faq_items"
    ADD CONSTRAINT "ai_faq_items_knowledge_source_id_fkey" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."ai_knowledge_sources"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_faq_items_organization_id_fkey' AND conrelid = '"public"."ai_faq_items"'::regclass)
   AND to_regclass('"public"."ai_faq_items_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_faq_items"
    ADD CONSTRAINT "ai_faq_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_invocations_agent_id_fkey' AND conrelid = '"public"."ai_invocations"'::regclass)
   AND to_regclass('"public"."ai_invocations_agent_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_invocations_conversation_id_fkey' AND conrelid = '"public"."ai_invocations"'::regclass)
   AND to_regclass('"public"."ai_invocations_conversation_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_invocations_message_id_fkey' AND conrelid = '"public"."ai_invocations"'::regclass)
   AND to_regclass('"public"."ai_invocations_message_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_invocations_organization_id_fkey' AND conrelid = '"public"."ai_invocations"'::regclass)
   AND to_regclass('"public"."ai_invocations_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_invocations"
    ADD CONSTRAINT "ai_invocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_sources_agent_id_fkey' AND conrelid = '"public"."ai_knowledge_sources"'::regclass)
   AND to_regclass('"public"."ai_knowledge_sources_agent_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_sources"
    ADD CONSTRAINT "ai_knowledge_sources_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_sources_organization_id_fkey' AND conrelid = '"public"."ai_knowledge_sources"'::regclass)
   AND to_regclass('"public"."ai_knowledge_sources_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_sources"
    ADD CONSTRAINT "ai_knowledge_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_versions_activated_by_fkey' AND conrelid = '"public"."ai_knowledge_versions"'::regclass)
   AND to_regclass('"public"."ai_knowledge_versions_activated_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_versions"
    ADD CONSTRAINT "ai_knowledge_versions_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_versions_agent_id_fkey' AND conrelid = '"public"."ai_knowledge_versions"'::regclass)
   AND to_regclass('"public"."ai_knowledge_versions_agent_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_versions"
    ADD CONSTRAINT "ai_knowledge_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_knowledge_versions_organization_id_fkey' AND conrelid = '"public"."ai_knowledge_versions"'::regclass)
   AND to_regclass('"public"."ai_knowledge_versions_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_knowledge_versions"
    ADD CONSTRAINT "ai_knowledge_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_provider_credentials_created_by_fkey' AND conrelid = '"public"."ai_provider_credentials"'::regclass)
   AND to_regclass('"public"."ai_provider_credentials_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'ai_provider_credentials_organization_id_fkey' AND conrelid = '"public"."ai_provider_credentials"'::regclass)
   AND to_regclass('"public"."ai_provider_credentials_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_audit_log_actor_api_token_id_fkey' AND conrelid = '"public"."api_audit_log"'::regclass)
   AND to_regclass('"public"."api_audit_log_actor_api_token_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_audit_log"
    ADD CONSTRAINT "api_audit_log_actor_api_token_id_fkey" FOREIGN KEY ("actor_api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_audit_log_actor_user_id_fkey' AND conrelid = '"public"."api_audit_log"'::regclass)
   AND to_regclass('"public"."api_audit_log_actor_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_audit_log"
    ADD CONSTRAINT "api_audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_audit_log_organization_id_fkey' AND conrelid = '"public"."api_audit_log"'::regclass)
   AND to_regclass('"public"."api_audit_log_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_audit_log"
    ADD CONSTRAINT "api_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_tokens_created_by_fkey' AND conrelid = '"public"."api_tokens"'::regclass)
   AND to_regclass('"public"."api_tokens_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_tokens"
    ADD CONSTRAINT "api_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_tokens_organization_id_fkey' AND conrelid = '"public"."api_tokens"'::regclass)
   AND to_regclass('"public"."api_tokens_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_tokens"
    ADD CONSTRAINT "api_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'api_tokens_revoked_by_fkey' AND conrelid = '"public"."api_tokens"'::regclass)
   AND to_regclass('"public"."api_tokens_revoked_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."api_tokens"
    ADD CONSTRAINT "api_tokens_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_session_warmup_channel_session_id_fkey' AND conrelid = '"public"."channel_session_warmup"'::regclass)
   AND to_regclass('"public"."channel_session_warmup_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_session_warmup"
    ADD CONSTRAINT "channel_session_warmup_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_session_warmup_organization_id_fkey' AND conrelid = '"public"."channel_session_warmup"'::regclass)
   AND to_regclass('"public"."channel_session_warmup_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_session_warmup"
    ADD CONSTRAINT "channel_session_warmup_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_created_by_fkey' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'channel_sessions_organization_id_fkey' AND conrelid = '"public"."channel_sessions"'::regclass)
   AND to_regclass('"public"."channel_sessions_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."channel_sessions"
    ADD CONSTRAINT "channel_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'contacts_is_merged_into_fkey' AND conrelid = '"public"."contacts"'::regclass)
   AND to_regclass('"public"."contacts_is_merged_into_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_is_merged_into_fkey" FOREIGN KEY ("is_merged_into") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'contacts_organization_id_fkey' AND conrelid = '"public"."contacts"'::regclass)
   AND to_regclass('"public"."contacts_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_assigned_to_user_id_fkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_assigned_to_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_channel_session_id_fkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_contact_id_fkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_organization_id_fkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'conversations_usable_for_rag_marked_by_fkey' AND conrelid = '"public"."conversations"'::regclass)
   AND to_regclass('"public"."conversations_usable_for_rag_marked_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_usable_for_rag_marked_by_fkey" FOREIGN KEY ("usable_for_rag_marked_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_activities_contact_id_fkey' AND conrelid = '"public"."crm_lead_activities"'::regclass)
   AND to_regclass('"public"."crm_lead_activities_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_activities_lead_id_fkey' AND conrelid = '"public"."crm_lead_activities"'::regclass)
   AND to_regclass('"public"."crm_lead_activities_lead_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_activities_organization_id_fkey' AND conrelid = '"public"."crm_lead_activities"'::regclass)
   AND to_regclass('"public"."crm_lead_activities_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_activities"
    ADD CONSTRAINT "crm_lead_activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_links_lead_id_fkey' AND conrelid = '"public"."crm_lead_links"'::regclass)
   AND to_regclass('"public"."crm_lead_links_lead_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_links"
    ADD CONSTRAINT "crm_lead_links_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_lead_links_organization_id_fkey' AND conrelid = '"public"."crm_lead_links"'::regclass)
   AND to_regclass('"public"."crm_lead_links_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_lead_links"
    ADD CONSTRAINT "crm_lead_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_leads_contact_id_fkey' AND conrelid = '"public"."crm_leads"'::regclass)
   AND to_regclass('"public"."crm_leads_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_leads_organization_id_fkey' AND conrelid = '"public"."crm_leads"'::regclass)
   AND to_regclass('"public"."crm_leads_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_leads_pipeline_id_fkey' AND conrelid = '"public"."crm_leads"'::regclass)
   AND to_regclass('"public"."crm_leads_pipeline_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_leads_stage_id_fkey' AND conrelid = '"public"."crm_leads"'::regclass)
   AND to_regclass('"public"."crm_leads_stage_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_pipelines_organization_id_fkey' AND conrelid = '"public"."crm_pipelines"'::regclass)
   AND to_regclass('"public"."crm_pipelines_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_pipelines"
    ADD CONSTRAINT "crm_pipelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_stages_organization_id_fkey' AND conrelid = '"public"."crm_stages"'::regclass)
   AND to_regclass('"public"."crm_stages_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_stages"
    ADD CONSTRAINT "crm_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'crm_stages_pipeline_id_fkey' AND conrelid = '"public"."crm_stages"'::regclass)
   AND to_regclass('"public"."crm_stages_pipeline_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."crm_stages"
    ADD CONSTRAINT "crm_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'event_log_organization_id_fkey' AND conrelid = '"public"."event_log"'::regclass)
   AND to_regclass('"public"."event_log_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."event_log"
    ADD CONSTRAINT "event_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'idempotency_keys_organization_id_fkey' AND conrelid = '"public"."idempotency_keys"'::regclass)
   AND to_regclass('"public"."idempotency_keys_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'incidents_acknowledged_by_fkey' AND conrelid = '"public"."incidents"'::regclass)
   AND to_regclass('"public"."incidents_acknowledged_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'incidents_organization_id_fkey' AND conrelid = '"public"."incidents"'::regclass)
   AND to_regclass('"public"."incidents_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'incidents_resolved_by_fkey' AND conrelid = '"public"."incidents"'::regclass)
   AND to_regclass('"public"."incidents_resolved_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'lgpd_requests_contact_id_fkey' AND conrelid = '"public"."lgpd_requests"'::regclass)
   AND to_regclass('"public"."lgpd_requests_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."lgpd_requests"
    ADD CONSTRAINT "lgpd_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'lgpd_requests_organization_id_fkey' AND conrelid = '"public"."lgpd_requests"'::regclass)
   AND to_regclass('"public"."lgpd_requests_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."lgpd_requests"
    ADD CONSTRAINT "lgpd_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'merge_queue_organization_id_fkey' AND conrelid = '"public"."merge_queue"'::regclass)
   AND to_regclass('"public"."merge_queue_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."merge_queue"
    ADD CONSTRAINT "merge_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_activity_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_activity_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."crm_lead_activities"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_channel_session_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_contact_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_conversation_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_conversation_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_organization_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'messages_sent_by_user_id_fkey' AND conrelid = '"public"."messages"'::regclass)
   AND to_regclass('"public"."messages_sent_by_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'nuvemshop_products_organization_id_fkey' AND conrelid = '"public"."nuvemshop_products"'::regclass)
   AND to_regclass('"public"."nuvemshop_products_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."nuvemshop_products"
    ADD CONSTRAINT "nuvemshop_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'orders_contact_id_fkey' AND conrelid = '"public"."orders"'::regclass)
   AND to_regclass('"public"."orders_contact_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'orders_organization_id_fkey' AND conrelid = '"public"."orders"'::regclass)
   AND to_regclass('"public"."orders_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'organizations_created_by_fkey' AND conrelid = '"public"."organizations"'::regclass)
   AND to_regclass('"public"."organizations_created_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'organizations_suspended_by_fkey' AND conrelid = '"public"."organizations"'::regclass)
   AND to_regclass('"public"."organizations_suspended_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "neon_auth"."user"("id");
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'platform_admins_granted_by_fkey' AND conrelid = '"public"."platform_admins"'::regclass)
   AND to_regclass('"public"."platform_admins_granted_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "neon_auth"."user"("id") ON DELETE RESTRICT;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'platform_admins_revoked_by_fkey' AND conrelid = '"public"."platform_admins"'::regclass)
   AND to_regclass('"public"."platform_admins_revoked_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'platform_admins_user_id_fkey' AND conrelid = '"public"."platform_admins"'::regclass)
   AND to_regclass('"public"."platform_admins_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'storage_redaction_queue_organization_id_fkey' AND conrelid = '"public"."storage_redaction_queue"'::regclass)
   AND to_regclass('"public"."storage_redaction_queue_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."storage_redaction_queue"
    ADD CONSTRAINT "storage_redaction_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'storage_redaction_queue_request_id_fkey' AND conrelid = '"public"."storage_redaction_queue"'::regclass)
   AND to_regclass('"public"."storage_redaction_queue_request_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."storage_redaction_queue"
    ADD CONSTRAINT "storage_redaction_queue_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."lgpd_requests"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'tenant_integrations_organization_id_fkey' AND conrelid = '"public"."tenant_integrations"'::regclass)
   AND to_regclass('"public"."tenant_integrations_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."tenant_integrations"
    ADD CONSTRAINT "tenant_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_organizations_invited_by_fkey' AND conrelid = '"public"."user_organizations"'::regclass)
   AND to_regclass('"public"."user_organizations_invited_by_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "neon_auth"."user"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_organizations_organization_id_fkey' AND conrelid = '"public"."user_organizations"'::regclass)
   AND to_regclass('"public"."user_organizations_organization_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_organizations_user_id_fkey' AND conrelid = '"public"."user_organizations"'::regclass)
   AND to_regclass('"public"."user_organizations_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'user_recovery_codes_user_id_fkey' AND conrelid = '"public"."user_recovery_codes"'::regclass)
   AND to_regclass('"public"."user_recovery_codes_user_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."user_recovery_codes"
    ADD CONSTRAINT "user_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "neon_auth"."user"("id") ON DELETE CASCADE;
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'webhook_events_log_channel_session_id_fkey' AND conrelid = '"public"."webhook_events_log"'::regclass)
   AND to_regclass('"public"."webhook_events_log_channel_session_id_fkey"') IS NULL THEN
ALTER TABLE ONLY "public"."webhook_events_log"
    ADD CONSTRAINT "webhook_events_log_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "public"."channel_sessions"("id") ON DELETE SET NULL;
END IF; END $baseline_guard$;

ALTER TABLE "public"."ai_agent_runs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_agent_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_agents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_budgets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_chunks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_faq_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_invocations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_knowledge_sources" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_knowledge_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_models" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'ai_models_read_all' AND polrelid = '"public"."ai_models"'::regclass) THEN
CREATE POLICY "ai_models_read_all" ON "public"."ai_models" FOR SELECT USING (true);
END IF; END $baseline_guard$;

ALTER TABLE "public"."ai_pricing" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'ai_pricing_public_read' AND polrelid = '"public"."ai_pricing"'::regclass) THEN
CREATE POLICY "ai_pricing_public_read" ON "public"."ai_pricing" FOR SELECT USING (true);
END IF; END $baseline_guard$;

ALTER TABLE "public"."ai_provider_credentials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."api_audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."api_tokens" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'api_tokens_admin_only' AND polrelid = '"public"."api_tokens"'::regclass) THEN
CREATE POLICY "api_tokens_admin_only" ON "public"."api_tokens" USING (("public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"())) WITH CHECK (("public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'audit_log_insert_tenant_member' AND polrelid = '"public"."api_audit_log"'::regclass) THEN
CREATE POLICY "audit_log_insert_tenant_member" ON "public"."api_audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'audit_log_select' AND polrelid = '"public"."api_audit_log"'::regclass) THEN
CREATE POLICY "audit_log_select" ON "public"."api_audit_log" FOR SELECT USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'admin'::"text"))));
END IF; END $baseline_guard$;

ALTER TABLE "public"."channel_session_warmup" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."channel_sessions" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'channel_sessions_tenant_isolation_all' AND polrelid = '"public"."channel_sessions"'::regclass) THEN
CREATE POLICY "channel_sessions_tenant_isolation_all" ON "public"."channel_sessions" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'conversations_tenant_isolation_all' AND polrelid = '"public"."conversations"'::regclass) THEN
CREATE POLICY "conversations_tenant_isolation_all" ON "public"."conversations" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."crm_lead_activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."crm_lead_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."crm_leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."crm_pipelines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."crm_stages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."event_log" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'event_log_select' AND polrelid = '"public"."event_log"'::regclass) THEN
CREATE POLICY "event_log_select" ON "public"."event_log" FOR SELECT USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."idempotency_keys" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'idempotency_tenant' AND polrelid = '"public"."idempotency_keys"'::regclass) THEN
CREATE POLICY "idempotency_tenant" ON "public"."idempotency_keys" USING (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")));
END IF; END $baseline_guard$;

ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."lgpd_requests" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'lgpd_requests_admin_select' AND polrelid = '"public"."lgpd_requests"'::regclass) THEN
CREATE POLICY "lgpd_requests_admin_select" ON "public"."lgpd_requests" FOR SELECT USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'admin'::"text"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'lgpd_requests_admin_write' AND polrelid = '"public"."lgpd_requests"'::regclass) THEN
CREATE POLICY "lgpd_requests_admin_write" ON "public"."lgpd_requests" USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'admin'::"text")))) WITH CHECK (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'admin'::"text"))));
END IF; END $baseline_guard$;

ALTER TABLE "public"."merge_queue" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'merge_queue_manager_select' AND polrelid = '"public"."merge_queue"'::regclass) THEN
CREATE POLICY "merge_queue_manager_select" ON "public"."merge_queue" FOR SELECT USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'manager'::"text"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'merge_queue_manager_write' AND polrelid = '"public"."merge_queue"'::regclass) THEN
CREATE POLICY "merge_queue_manager_write" ON "public"."merge_queue" USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'manager'::"text")))) WITH CHECK (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'manager'::"text"))));
END IF; END $baseline_guard$;

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'messages_tenant_isolation_all' AND polrelid = '"public"."messages"'::regclass) THEN
CREATE POLICY "messages_tenant_isolation_all" ON "public"."messages" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."nuvemshop_products" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'nuvemshop_products_tenant' AND polrelid = '"public"."nuvemshop_products"'::regclass) THEN
CREATE POLICY "nuvemshop_products_tenant" ON "public"."nuvemshop_products" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'orders_tenant_select' AND polrelid = '"public"."orders"'::regclass) THEN
CREATE POLICY "orders_tenant_select" ON "public"."orders" FOR SELECT USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'orders_tenant_write' AND polrelid = '"public"."orders"'::regclass) THEN
CREATE POLICY "orders_tenant_write" ON "public"."orders" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'orgs_select' AND polrelid = '"public"."organizations"'::regclass) THEN
CREATE POLICY "orgs_select" ON "public"."organizations" FOR SELECT USING ((("id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'orgs_write_platform_admin' AND polrelid = '"public"."organizations"'::regclass) THEN
CREATE POLICY "orgs_write_platform_admin" ON "public"."organizations" USING ("public"."fn_is_platform_admin"()) WITH CHECK ("public"."fn_is_platform_admin"());
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'platform_admin_only_incidents' AND polrelid = '"public"."incidents"'::regclass) THEN
CREATE POLICY "platform_admin_only_incidents" ON "public"."incidents" USING ("public"."fn_is_platform_admin"()) WITH CHECK ("public"."fn_is_platform_admin"());
END IF; END $baseline_guard$;

ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'platform_admins_self' AND polrelid = '"public"."platform_admins"'::regclass) THEN
CREATE POLICY "platform_admins_self" ON "public"."platform_admins" FOR SELECT USING ("public"."fn_is_platform_admin"());
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'recovery_codes_self' AND polrelid = '"public"."user_recovery_codes"'::regclass) THEN
CREATE POLICY "recovery_codes_self" ON "public"."user_recovery_codes" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."storage_redaction_queue" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."tenant_integrations" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_integrations_admin_write' AND polrelid = '"public"."tenant_integrations"'::regclass) THEN
CREATE POLICY "tenant_integrations_admin_write" ON "public"."tenant_integrations" USING (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'manager'::"text")))) WITH CHECK (("public"."fn_is_platform_admin"() OR (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) AND "public"."fn_role_at_least"("organization_id", 'manager'::"text"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_integrations_select' AND polrelid = '"public"."tenant_integrations"'::regclass) THEN
CREATE POLICY "tenant_integrations_select" ON "public"."tenant_integrations" FOR SELECT USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_agent_runs_all' AND polrelid = '"public"."ai_agent_runs"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_agent_runs_all" ON "public"."ai_agent_runs" USING (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids")))) WITH CHECK (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_agent_versions_all' AND polrelid = '"public"."ai_agent_versions"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_agent_versions_all" ON "public"."ai_agent_versions" USING (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids")))) WITH CHECK (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_agents_all' AND polrelid = '"public"."ai_agents"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_agents_all" ON "public"."ai_agents" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_budgets_all' AND polrelid = '"public"."ai_budgets"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_budgets_all" ON "public"."ai_budgets" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_chunks_all' AND polrelid = '"public"."ai_chunks"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_chunks_all" ON "public"."ai_chunks" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_faq_items_all' AND polrelid = '"public"."ai_faq_items"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_faq_items_all" ON "public"."ai_faq_items" USING (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids"))) WITH CHECK (("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_invocations_all' AND polrelid = '"public"."ai_invocations"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_invocations_all" ON "public"."ai_invocations" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_kbv_all' AND polrelid = '"public"."ai_knowledge_versions"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_kbv_all" ON "public"."ai_knowledge_versions" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_knowledge_sources_all' AND polrelid = '"public"."ai_knowledge_sources"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_knowledge_sources_all" ON "public"."ai_knowledge_sources" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_provider_credentials_modify' AND polrelid = '"public"."ai_provider_credentials"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_provider_credentials_modify" ON "public"."ai_provider_credentials" USING (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids")))) WITH CHECK (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_ai_provider_credentials_select' AND polrelid = '"public"."ai_provider_credentials"'::regclass) THEN
CREATE POLICY "tenant_isolation_ai_provider_credentials_select" ON "public"."ai_provider_credentials" FOR SELECT USING (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids"))));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_contacts_all' AND polrelid = '"public"."contacts"'::regclass) THEN
CREATE POLICY "tenant_isolation_contacts_all" ON "public"."contacts" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_lead_activities_insert' AND polrelid = '"public"."crm_lead_activities"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_lead_activities_insert" ON "public"."crm_lead_activities" FOR INSERT WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_lead_activities_select' AND polrelid = '"public"."crm_lead_activities"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_lead_activities_select" ON "public"."crm_lead_activities" FOR SELECT USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_lead_links_all' AND polrelid = '"public"."crm_lead_links"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_lead_links_all" ON "public"."crm_lead_links" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_leads_all' AND polrelid = '"public"."crm_leads"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_leads_all" ON "public"."crm_leads" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_pipelines_all' AND polrelid = '"public"."crm_pipelines"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_pipelines_all" ON "public"."crm_pipelines" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_crm_stages_all' AND polrelid = '"public"."crm_stages"'::regclass) THEN
CREATE POLICY "tenant_isolation_crm_stages_all" ON "public"."crm_stages" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'tenant_isolation_storage_redaction_queue_all' AND polrelid = '"public"."storage_redaction_queue"'::regclass) THEN
CREATE POLICY "tenant_isolation_storage_redaction_queue_all" ON "public"."storage_redaction_queue" USING (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids")))) WITH CHECK (("organization_id" IN ( SELECT "fn_user_org_ids"."fn_user_org_ids"
   FROM "public"."fn_user_org_ids"() "fn_user_org_ids"("fn_user_org_ids"))));
END IF; END $baseline_guard$;

ALTER TABLE "public"."user_organizations" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'user_orgs_delete' AND polrelid = '"public"."user_organizations"'::regclass) THEN
CREATE POLICY "user_orgs_delete" ON "public"."user_organizations" FOR DELETE USING (("public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'user_orgs_insert' AND polrelid = '"public"."user_organizations"'::regclass) THEN
CREATE POLICY "user_orgs_insert" ON "public"."user_organizations" FOR INSERT WITH CHECK (("public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'user_orgs_select' AND polrelid = '"public"."user_organizations"'::regclass) THEN
CREATE POLICY "user_orgs_select" ON "public"."user_organizations" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'user_orgs_update' AND polrelid = '"public"."user_organizations"'::regclass) THEN
CREATE POLICY "user_orgs_update" ON "public"."user_organizations" FOR UPDATE USING (("public"."fn_role_at_least"("organization_id", 'admin'::"text") OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."user_recovery_codes" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'warmup_tenant_isolation_all' AND polrelid = '"public"."channel_session_warmup"'::regclass) THEN
CREATE POLICY "warmup_tenant_isolation_all" ON "public"."channel_session_warmup" USING ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"())) WITH CHECK ((("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")) OR "public"."fn_is_platform_admin"()));
END IF; END $baseline_guard$;

ALTER TABLE "public"."webhook_events_log" ENABLE ROW LEVEL SECURITY;

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'webhook_events_log_tenant_read' AND polrelid = '"public"."webhook_events_log"'::regclass) THEN
CREATE POLICY "webhook_events_log_tenant_read" ON "public"."webhook_events_log" FOR SELECT USING (("public"."fn_is_platform_admin"() OR (("organization_id" IS NOT NULL) AND ("organization_id" IN ( SELECT "public"."fn_user_org_ids"() AS "fn_user_org_ids")))));
END IF; END $baseline_guard$;

GRANT USAGE ON SCHEMA "public" TO "anon";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

GRANT USAGE ON SCHEMA "public" TO "service_role";

REVOKE ALL ON FUNCTION "public"."activate_kb_version"("p_agent_id" "uuid", "p_version_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."activate_kb_version"("p_agent_id" "uuid", "p_version_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."activate_kb_version"("p_agent_id" "uuid", "p_version_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."emit_event"("p_event_type" "text", "p_entity_kind" "text", "p_entity_id" "uuid", "p_payload" "jsonb", "p_metadata" "jsonb", "p_organization_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."emit_event"("p_event_type" "text", "p_entity_kind" "text", "p_entity_id" "uuid", "p_payload" "jsonb", "p_metadata" "jsonb", "p_organization_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_audit_log_row"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_crm_lead_close_on_stage"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_crm_lead_close_on_stage"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_crm_lead_close_on_stage"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_decrypt_oauth"("ciphertext" "bytea") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_decrypt_oauth"("ciphertext" "bytea") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_emit_channel_session_status_changed"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_emit_channel_session_status_changed"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_emit_channel_session_status_changed"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_emit_event_on_lead_change"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_emit_event_on_lead_change"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_emit_event_on_lead_change"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_emit_message_event"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_emit_message_event"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_emit_message_event"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_encrypt_oauth"("plaintext" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_encrypt_oauth"("plaintext" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_is_platform_admin"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_is_platform_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_lgpd_cascade_redact_contact"("p_organization_id" "uuid", "p_contact_id" "uuid", "p_request_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_lgpd_cascade_redact_contact"("p_organization_id" "uuid", "p_contact_id" "uuid", "p_request_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_log_event"("p_organization_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_log_event"("p_organization_id" "uuid", "p_event_type" "text", "p_payload" "jsonb") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_publish_ai_agent_version"("p_org_id" "uuid", "p_agent_id" "uuid", "p_version_id" "uuid") TO "anon";

GRANT ALL ON FUNCTION "public"."fn_publish_ai_agent_version"("p_org_id" "uuid", "p_agent_id" "uuid", "p_version_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_publish_ai_agent_version"("p_org_id" "uuid", "p_agent_id" "uuid", "p_version_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_role_at_least"("p_org" "uuid", "p_min" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_role_at_least"("p_org" "uuid", "p_min" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_seed_default_pipeline_for_org"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_seed_default_pipeline_for_org"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_seed_default_pipeline_for_org"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_update_budget_consumption"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_update_budget_consumption"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_update_last_activity_at"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_update_last_activity_at"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_update_last_activity_at"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_user_org_ids"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_user_org_ids"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_user_role_in"("p_org" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_user_role_in"("p_org" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_user_role_in_org"("p_org" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_user_role_in_org"("p_org" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_validate_activity_lead_org"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_validate_activity_lead_org"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_validate_activity_lead_org"() TO "service_role";

GRANT ALL ON FUNCTION "public"."fn_validate_lost_reason_required"() TO "anon";

GRANT ALL ON FUNCTION "public"."fn_validate_lost_reason_required"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_validate_lost_reason_required"() TO "service_role";

GRANT ALL ON FUNCTION "public"."midpoint"("p_prev" numeric, "p_next" numeric) TO "anon";

GRANT ALL ON FUNCTION "public"."midpoint"("p_prev" numeric, "p_next" numeric) TO "authenticated";

GRANT ALL ON FUNCTION "public"."midpoint"("p_prev" numeric, "p_next" numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."retrieve_top_k_chunks"("p_organization_id" "uuid", "p_kb_version_id" "uuid", "p_embedding" "public"."vector", "p_k" integer, "p_threshold" real) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."retrieve_top_k_chunks"("p_organization_id" "uuid", "p_kb_version_id" "uuid", "p_embedding" "public"."vector", "p_k" integer, "p_threshold" real) TO "authenticated";

GRANT ALL ON FUNCTION "public"."retrieve_top_k_chunks"("p_organization_id" "uuid", "p_kb_version_id" "uuid", "p_embedding" "public"."vector", "p_k" integer, "p_threshold" real) TO "service_role";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT ALL ON TABLE "public"."ai_agent_runs" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_agent_runs" TO "service_role";

GRANT ALL ON TABLE "public"."ai_agent_versions" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_agent_versions" TO "service_role";

GRANT ALL ON TABLE "public"."ai_agents" TO "anon";

GRANT ALL ON TABLE "public"."ai_agents" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_agents" TO "service_role";

GRANT ALL ON TABLE "public"."ai_budgets" TO "anon";

GRANT ALL ON TABLE "public"."ai_budgets" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_budgets" TO "service_role";

GRANT ALL ON TABLE "public"."ai_chunks" TO "anon";

GRANT ALL ON TABLE "public"."ai_chunks" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_chunks" TO "service_role";

GRANT ALL ON TABLE "public"."ai_faq_items" TO "anon";

GRANT ALL ON TABLE "public"."ai_faq_items" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_faq_items" TO "service_role";

GRANT ALL ON TABLE "public"."ai_invocations" TO "anon";

GRANT ALL ON TABLE "public"."ai_invocations" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_invocations" TO "service_role";

GRANT ALL ON TABLE "public"."ai_knowledge_sources" TO "anon";

GRANT ALL ON TABLE "public"."ai_knowledge_sources" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_knowledge_sources" TO "service_role";

GRANT ALL ON TABLE "public"."ai_knowledge_versions" TO "anon";

GRANT ALL ON TABLE "public"."ai_knowledge_versions" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_knowledge_versions" TO "service_role";

GRANT ALL ON TABLE "public"."ai_models" TO "anon";

GRANT ALL ON TABLE "public"."ai_models" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_models" TO "service_role";

GRANT ALL ON TABLE "public"."ai_pricing" TO "anon";

GRANT ALL ON TABLE "public"."ai_pricing" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_pricing" TO "service_role";

GRANT ALL ON TABLE "public"."ai_provider_credentials" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_provider_credentials" TO "service_role";

GRANT ALL ON TABLE "public"."ai_provider_credentials_safe" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_provider_credentials_safe" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_audit_log" TO "anon";

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_audit_log" TO "authenticated";

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."api_audit_log" TO "service_role";

GRANT ALL ON TABLE "public"."api_tokens" TO "anon";

GRANT ALL ON TABLE "public"."api_tokens" TO "authenticated";

GRANT ALL ON TABLE "public"."api_tokens" TO "service_role";

GRANT ALL ON TABLE "public"."channel_session_warmup" TO "anon";

GRANT ALL ON TABLE "public"."channel_session_warmup" TO "authenticated";

GRANT ALL ON TABLE "public"."channel_session_warmup" TO "service_role";

GRANT ALL ON TABLE "public"."channel_sessions" TO "anon";

GRANT ALL ON TABLE "public"."channel_sessions" TO "authenticated";

GRANT ALL ON TABLE "public"."channel_sessions" TO "service_role";

GRANT ALL ON TABLE "public"."contacts" TO "anon";

GRANT ALL ON TABLE "public"."contacts" TO "authenticated";

GRANT ALL ON TABLE "public"."contacts" TO "service_role";

GRANT ALL ON TABLE "public"."conversations" TO "anon";

GRANT ALL ON TABLE "public"."conversations" TO "authenticated";

GRANT ALL ON TABLE "public"."conversations" TO "service_role";

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."crm_lead_activities" TO "anon";

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."crm_lead_activities" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_lead_activities" TO "service_role";

GRANT ALL ON TABLE "public"."crm_lead_links" TO "anon";

GRANT ALL ON TABLE "public"."crm_lead_links" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_lead_links" TO "service_role";

GRANT ALL ON TABLE "public"."crm_leads" TO "anon";

GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";

GRANT ALL ON TABLE "public"."crm_pipelines" TO "anon";

GRANT ALL ON TABLE "public"."crm_pipelines" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_pipelines" TO "service_role";

GRANT ALL ON TABLE "public"."crm_stages" TO "anon";

GRANT ALL ON TABLE "public"."crm_stages" TO "authenticated";

GRANT ALL ON TABLE "public"."crm_stages" TO "service_role";

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_log" TO "anon";

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."event_log" TO "authenticated";

GRANT ALL ON TABLE "public"."event_log" TO "service_role";

GRANT ALL ON TABLE "public"."idempotency_keys" TO "anon";

GRANT ALL ON TABLE "public"."idempotency_keys" TO "authenticated";

GRANT ALL ON TABLE "public"."idempotency_keys" TO "service_role";

GRANT ALL ON TABLE "public"."incidents" TO "anon";

GRANT ALL ON TABLE "public"."incidents" TO "authenticated";

GRANT ALL ON TABLE "public"."incidents" TO "service_role";

GRANT ALL ON TABLE "public"."lgpd_requests" TO "anon";

GRANT ALL ON TABLE "public"."lgpd_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."lgpd_requests" TO "service_role";

GRANT ALL ON TABLE "public"."merge_queue" TO "anon";

GRANT ALL ON TABLE "public"."merge_queue" TO "authenticated";

GRANT ALL ON TABLE "public"."merge_queue" TO "service_role";

GRANT ALL ON TABLE "public"."messages" TO "anon";

GRANT ALL ON TABLE "public"."messages" TO "authenticated";

GRANT ALL ON TABLE "public"."messages" TO "service_role";

GRANT ALL ON TABLE "public"."nuvemshop_products" TO "anon";

GRANT ALL ON TABLE "public"."nuvemshop_products" TO "authenticated";

GRANT ALL ON TABLE "public"."nuvemshop_products" TO "service_role";

GRANT ALL ON TABLE "public"."orders" TO "anon";

GRANT ALL ON TABLE "public"."orders" TO "authenticated";

GRANT ALL ON TABLE "public"."orders" TO "service_role";

GRANT ALL ON TABLE "public"."organizations" TO "anon";

GRANT ALL ON TABLE "public"."organizations" TO "authenticated";

GRANT ALL ON TABLE "public"."organizations" TO "service_role";

GRANT ALL ON TABLE "public"."platform_admins" TO "anon";

GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";

GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";

GRANT ALL ON TABLE "public"."storage_redaction_queue" TO "authenticated";

GRANT ALL ON TABLE "public"."storage_redaction_queue" TO "service_role";

GRANT ALL ON TABLE "public"."tenant_integrations" TO "anon";

GRANT ALL ON TABLE "public"."tenant_integrations" TO "authenticated";

GRANT ALL ON TABLE "public"."tenant_integrations" TO "service_role";

GRANT ALL ON TABLE "public"."user_organizations" TO "anon";

GRANT ALL ON TABLE "public"."user_organizations" TO "authenticated";

GRANT ALL ON TABLE "public"."user_organizations" TO "service_role";

GRANT ALL ON TABLE "public"."user_recovery_codes" TO "anon";

GRANT ALL ON TABLE "public"."user_recovery_codes" TO "authenticated";

GRANT ALL ON TABLE "public"."user_recovery_codes" TO "service_role";

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webhook_events_log" TO "anon";

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webhook_events_log" TO "authenticated";

GRANT ALL ON TABLE "public"."webhook_events_log" TO "service_role";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

insert into public.ai_models (provider, model_id, display_name, description, context_window, input_price_per_million_cents, output_price_per_million_cents, supports_tools, is_default_for_provider)
values
  ('anthropic', 'claude-opus-4-7',    'Claude Opus 4.7',    'Flagship Anthropic — raciocínio complexo',                  200000,  1500, 7500, true, false),
  ('anthropic', 'claude-sonnet-4-6',  'Claude Sonnet 4.6',  'Default recomendado — equilíbrio custo/qualidade',           200000,   300, 1500, true, true),
  ('anthropic', 'claude-haiku-4-5',   'Claude Haiku 4.5',   'Cheap/fast — atendimentos curtos e classificação',           200000,   100,  500, true, false),
  ('openai',    'gpt-5',              'GPT-5',              'Flagship OpenAI',                                           400000,   500, 4000, true, false),
  ('openai',    'gpt-5-mini',         'GPT-5 Mini',         'Cheap/fast OpenAI',                                         400000,   150,  600, true, true),
  ('openai',    'gpt-4o',             'GPT-4o (legacy)',    'Compat — uso legado',                                       128000,   250, 1000, true, false),
  ('google',    'gemini-2.5-pro',     'Gemini 2.5 Pro',     'Flagship Google',                                          1000000,   125,  500, true, false),
  ('google',    'gemini-2.5-flash',   'Gemini 2.5 Flash',   'Cheap/fast Google',                                        1000000,    30,  120, true, true)
on conflict (provider, model_id) do nothing;

alter table public.contacts
  add column if not exists wa_identity text
  generated always as (
    case
      when phone_number is not null then 'phone:' || phone_number
      when source_metadata->>'waha_lid' is not null
        then 'lid:' || regexp_replace(source_metadata->>'waha_lid', '@.*$', '')
      else null
    end
  ) stored;

with ranked as (
  select id, first_value(id) over (partition by organization_id, wa_identity order by created_at asc, id asc) as canonical_id
  from public.contacts where wa_identity is not null and is_merged_into is null
)
update public.contacts c set is_merged_into = r.canonical_id, merged_at = now()
from ranked r where c.id = r.id and r.id <> r.canonical_id;

update public.conversations       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.messages            t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.ai_agent_runs       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.crm_lead_activities t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.crm_leads           t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.lgpd_requests       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.orders              t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.contacts can set display_name = better.name
from (
  select coalesce(c.is_merged_into, c.id) as canonical_id,
    (array_agg(c.display_name order by (c.display_name ~ '^Contato ') asc, c.created_at asc)
       filter (where c.display_name is not null and c.display_name <> ''))[1] as name
  from public.contacts c
  where coalesce(c.is_merged_into, c.id) in (select is_merged_into from public.contacts where is_merged_into is not null)
  group by 1
) better
where can.id = better.canonical_id and better.name is not null
  and (can.display_name is null or can.display_name = '' or can.display_name ~ '^Contato ');

update public.messages t set conversation_id = canon.canonical_id
from (select id, first_value(id) over (partition by organization_id, contact_id, channel_session_id order by created_at asc, id asc) as canonical_id from public.conversations where is_group = false) canon
where t.conversation_id = canon.id and canon.id <> canon.canonical_id;

update public.ai_agent_runs t set conversation_id = canon.canonical_id
from (select id, first_value(id) over (partition by organization_id, contact_id, channel_session_id order by created_at asc, id asc) as canonical_id from public.conversations where is_group = false) canon
where t.conversation_id = canon.id and canon.id <> canon.canonical_id;

update public.ai_invocations t set conversation_id = canon.canonical_id
from (select id, first_value(id) over (partition by organization_id, contact_id, channel_session_id order by created_at asc, id asc) as canonical_id from public.conversations where is_group = false) canon
where t.conversation_id = canon.id and canon.id <> canon.canonical_id;

delete from public.conversations d
using (select id, first_value(id) over (partition by organization_id, contact_id, channel_session_id order by created_at asc, id asc) as canonical_id from public.conversations where is_group = false) canon
where d.id = canon.id and canon.id <> canon.canonical_id;

create unique index if not exists uniq_contacts_org_wa_identity
  on public.contacts (organization_id, wa_identity)
  where wa_identity is not null and is_merged_into is null;

create unique index if not exists uniq_conversations_1to1_per_contact_session
  on public.conversations (organization_id, contact_id, channel_session_id)
  where is_group = false;

create or replace function public.fn_upsert_wa_contact(
  p_org uuid, p_kind text, p_phone text, p_lid text, p_chat_id text, p_notify text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.contacts (organization_id, phone_number, source, consent, tags, source_metadata, display_name)
  values (p_org, case when p_kind = 'phone' then p_phone end, 'whatsapp', '{}'::jsonb, '{}'::text[],
    case when p_kind = 'lid' then jsonb_build_object('waha_lid', p_lid, 'notify_name', nullif(p_notify, ''))
      else jsonb_build_object('waha_chat_id', p_chat_id, 'notify_name', nullif(p_notify, '')) end,
    nullif(p_notify, ''))
  on conflict (organization_id, wa_identity) where wa_identity is not null and is_merged_into is null
  do update set display_name = coalesce(contacts.display_name, excluded.display_name), updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.fn_upsert_wa_conversation(
  p_org uuid, p_contact uuid, p_session uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.conversations (organization_id, contact_id, channel_session_id, channel, status, is_group, unread_count_for_assignee, metadata)
  values (p_org, p_contact, p_session, 'whatsapp', 'open', false, 0, '{}'::jsonb)
  on conflict (organization_id, contact_id, channel_session_id) where is_group = false
  do update set updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.fn_mark_conversation_message(
  p_conv uuid, p_direction text, p_preview text, p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = p_at, last_message_preview = p_preview,
    last_inbound_at  = case when p_direction = 'inbound'  then p_at else last_inbound_at  end,
    last_outbound_at = case when p_direction = 'outbound' then p_at else last_outbound_at end,
    unread_count_for_assignee = case
      when p_direction = 'inbound'  then unread_count_for_assignee + 1
      when p_direction = 'outbound' then 0
      else unread_count_for_assignee
    end,
    updated_at = now()
  where id = p_conv;
end; $$;

revoke all on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) from public;

revoke all on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) from public;

revoke all on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) from public;

grant execute on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) to service_role;

grant execute on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) to service_role;

grant execute on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) to service_role;

drop policy if exists "tenant_isolation_crm_pipelines_all" on public.crm_pipelines;

drop policy if exists "crm_pipelines_select" on public.crm_pipelines;

drop policy if exists "crm_pipelines_manager_write" on public.crm_pipelines;

create policy "crm_pipelines_select" on public.crm_pipelines
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_pipelines_manager_write" on public.crm_pipelines
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists "tenant_isolation_crm_stages_all" on public.crm_stages;

drop policy if exists "crm_stages_select" on public.crm_stages;

drop policy if exists "crm_stages_manager_write" on public.crm_stages;

create policy "crm_stages_select" on public.crm_stages
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_stages_manager_write" on public.crm_stages
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists "conversations_tenant_isolation_all" on public.conversations;

drop policy if exists "conversations_select" on public.conversations;

drop policy if exists "conversations_agent_write" on public.conversations;

create policy "conversations_select" on public.conversations
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "conversations_agent_write" on public.conversations
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

create table if not exists public.conversation_assignment_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_user_id    uuid references neon_auth.user(id) on delete set null,
  to_user_id      uuid references neon_auth.user(id) on delete set null,
  changed_by      uuid references neon_auth.user(id) on delete set null,
  reason          text not null
                  check (reason in ('claim','transfer','release','routing','handoff')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_cae_conversation
  on public.conversation_assignment_events (conversation_id, created_at desc);

alter table public.conversation_assignment_events enable row level security;

drop policy if exists cae_select on public.conversation_assignment_events;

create policy cae_select on public.conversation_assignment_events
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists cae_insert on public.conversation_assignment_events;

create policy cae_insert on public.conversation_assignment_events
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

revoke all on public.conversation_assignment_events from anon;

create or replace function public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid default null,
  p_enforce_expected boolean default false
) returns setof public.conversations
language plpgsql
set search_path = public
as $$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for update;
  if not found then
    return;
  end if;
  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;
  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         assigned_at = case when p_to_user_id is null then null else now() end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;
  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);
  return next v_conv;
end;
$$;

revoke all on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from public;

grant execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean)
  to authenticated, service_role;

alter table public.conversations
  add column if not exists assignee_kind text
  check (assignee_kind in ('user','ai'));

update public.conversations
   set assignee_kind = 'user'
 where assigned_to_user_id is not null
   and assignee_kind is distinct from 'user';

update public.conversations
   set assignee_kind = null
 where assigned_to_user_id is null
   and assignee_kind = 'user';

update public.conversations
   set assignee_kind = 'ai'
 where status = 'ai_handling'
   and assigned_to_user_id is null
   and assignee_kind is distinct from 'ai';

alter table public.conversations
  drop constraint if exists conversations_assignee_kind_coherence;

alter table public.conversations
  add constraint conversations_assignee_kind_coherence check (
    (assignee_kind = 'user' and assigned_to_user_id is not null) or
    (assignee_kind = 'ai'   and assigned_to_user_id is null)     or
    (assignee_kind is null)
  );

create or replace function public.fn_member_role_in_org(p_user uuid, p_org uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select uo.role
    from public.user_organizations uo
   where uo.user_id = p_user
     and uo.organization_id = p_org
     and uo.revoked_at is null
     and (
       auth.uid() is null
       or exists (
         select 1 from public.user_organizations me
          where me.user_id = auth.uid()
            and me.organization_id = p_org
            and me.revoked_at is null
       )
     )
   limit 1;
$$;

revoke all on function public.fn_member_role_in_org(uuid, uuid) from public;

revoke execute on function public.fn_member_role_in_org(uuid, uuid) from anon;

grant execute on function public.fn_member_role_in_org(uuid, uuid)
  to authenticated, service_role;

create or replace function public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid default null,
  p_enforce_expected boolean default false
) returns setof public.conversations
language plpgsql
set search_path = public
as $$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for update;
  if not found then
    return;
  end if;
  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;
  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;
  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);
  return next v_conv;
end;
$$;

revoke all on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from public;

grant execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean)
  to authenticated, service_role;

alter table public.conversations
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_conversations_tags_gin
  on public.conversations using gin (tags);

update public.organizations
   set settings = coalesce(settings, '{}'::jsonb)
       || jsonb_build_object(
            'canonical_conversation_tags',
            jsonb_build_array(
              'dúvida', 'reclamação', 'troca', 'devolução',
              'elogio', 'orçamento', 'pós-venda', 'urgente'
            )
          )
 where not (coalesce(settings, '{}'::jsonb) ? 'canonical_conversation_tags');

revoke execute on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) from anon;

revoke execute on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) from anon;

revoke execute on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) from anon;

revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from public;

revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from anon;

grant execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

revoke execute on function public.fn_log_event(uuid, text, jsonb) from public;

revoke execute on function public.fn_log_event(uuid, text, jsonb) from anon;

grant execute on function public.fn_log_event(uuid, text, jsonb) to authenticated, service_role;

revoke execute on function public.fn_audit_log_row() from public;

revoke execute on function public.fn_audit_log_row() from anon;

grant execute on function public.fn_audit_log_row() to service_role;

create or replace function public.fn_can_view_conversation(
  p_org uuid,
  p_assigned_to_user_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when public.fn_user_role_in_org(p_org) in ('viewer','manager','admin') then true
    when p_assigned_to_user_id = auth.uid() then true
    else case coalesce(
           (select settings->>'visibility_mode' from public.organizations where id = p_org),
           'own_and_unassigned')
         when 'all' then true
         when 'own_and_unassigned' then p_assigned_to_user_id is null
         else false
       end
  end;
$$;

revoke all on function public.fn_can_view_conversation(uuid, uuid) from public;

revoke execute on function public.fn_can_view_conversation(uuid, uuid) from anon;

grant execute on function public.fn_can_view_conversation(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "conversations_select" on public.conversations;

create policy "conversations_select" on public.conversations
  for select using (
    public.fn_can_view_conversation(organization_id, assigned_to_user_id)
  );

drop policy if exists "conversations_agent_write" on public.conversations;

drop policy if exists "conversations_agent_insert" on public.conversations;

drop policy if exists "conversations_agent_update" on public.conversations;

drop policy if exists "conversations_agent_delete" on public.conversations;

create policy "conversations_agent_insert" on public.conversations
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

create policy "conversations_agent_update" on public.conversations
  for update using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

create policy "conversations_agent_delete" on public.conversations
  for delete using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists "messages_tenant_isolation_all" on public.messages;

drop policy if exists "messages_select" on public.messages;

drop policy if exists "messages_insert" on public.messages;

drop policy if exists "messages_update" on public.messages;

drop policy if exists "messages_delete" on public.messages;

create policy "messages_select" on public.messages
  for select using (
    public.fn_is_platform_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
    )
  );

create policy "messages_insert" on public.messages
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "messages_update" on public.messages
  for update using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "messages_delete" on public.messages
  for delete using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create or replace function public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid default null,
  p_enforce_expected boolean default false
) returns setof public.conversations
language plpgsql security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;
  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for update;
  if not found then
    return;
  end if;
  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;
  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;
  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);
  return next v_conv;
end;
$$;

revoke all on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from public;

revoke execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from anon;

grant execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean)
  to authenticated, service_role;

create or replace function public.fn_can_view_lead(
  p_org uuid,
  p_owner_user_id uuid
) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when public.fn_user_role_in_org(p_org) in ('viewer','manager','admin') then true
    when p_owner_user_id = auth.uid() then true
    else case coalesce(
           (select settings->>'visibility_mode' from public.organizations where id = p_org),
           'own_and_unassigned')
         when 'all' then true
         when 'own_and_unassigned' then p_owner_user_id is null
         else false
       end
  end;
$$;

revoke all on function public.fn_can_view_lead(uuid, uuid) from public;

revoke execute on function public.fn_can_view_lead(uuid, uuid) from anon;

grant execute on function public.fn_can_view_lead(uuid, uuid)
  to authenticated, service_role;

drop policy if exists "tenant_isolation_crm_leads_all" on public.crm_leads;

drop policy if exists "crm_leads_select" on public.crm_leads;

drop policy if exists "crm_leads_insert" on public.crm_leads;

drop policy if exists "crm_leads_update" on public.crm_leads;

drop policy if exists "crm_leads_delete" on public.crm_leads;

create policy "crm_leads_select" on public.crm_leads
  for select using (
    public.fn_can_view_lead(organization_id, owner_user_id)
  );

create policy "crm_leads_insert" on public.crm_leads
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')
        and (public.fn_role_at_least(organization_id, 'manager')
             or public.fn_can_view_lead(organization_id, owner_user_id)))
  );

create policy "crm_leads_update" on public.crm_leads
  for update using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')
        and (public.fn_role_at_least(organization_id, 'manager')
             or public.fn_can_view_lead(organization_id, owner_user_id)))
  ) with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')
        and (public.fn_role_at_least(organization_id, 'manager')
             or public.fn_can_view_lead(organization_id, owner_user_id)))
  );

create policy "crm_leads_delete" on public.crm_leads
  for delete using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')
        and (public.fn_role_at_least(organization_id, 'manager')
             or public.fn_can_view_lead(organization_id, owner_user_id)))
  );

create index if not exists idx_crm_leads_org_status_closed_owner
  on public.crm_leads (organization_id, status, closed_at, owner_user_id)
  where closed_at is not null;

create index if not exists idx_conversations_org_assignee_assigned
  on public.conversations (organization_id, assigned_to_user_id, assigned_at)
  where assigned_to_user_id is not null;

create or replace function public.fn_attendant_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  lead_agg as (
    select
      owner_user_id as user_id,
      count(*) filter (where status = 'won')  as won,
      count(*) filter (where status = 'lost') as lost
    from public.crm_leads
    where organization_id = p_org
      and status in ('won', 'lost')
      and closed_at >= p_from and closed_at < p_to
      and owner_user_id is not null
      and (p_owner is null or owner_user_id = p_owner)
    group by owner_user_id
  ),
  conv_agg as (
    select
      assigned_to_user_id as user_id,
      count(*) as conversations_handled
    from public.conversations
    where organization_id = p_org
      and assigned_to_user_id is not null
      and assigned_at >= p_from and assigned_at < p_to
      and (p_owner is null or assigned_to_user_id = p_owner)
    group by assigned_to_user_id
  ),
  ttfr as (
    select
      c.assigned_to_user_id as user_id,
      avg(extract(epoch from (fr.first_human_out - fr.first_in))) as avg_first_response_seconds
    from public.conversations c
    cross join lateral (
      select
        min(m.sent_at) filter (where m.direction = 'inbound') as first_in,
        min(m.sent_at) filter (
          where m.direction = 'outbound' and m.sent_by_user_id is not null
        ) as first_human_out
      from public.messages m
      where m.conversation_id = c.id
    ) fr
    where c.organization_id = p_org
      and c.assigned_to_user_id is not null
      and (p_owner is null or c.assigned_to_user_id = p_owner)
      and fr.first_in is not null
      and fr.first_human_out is not null
      and fr.first_human_out > fr.first_in
      and fr.first_human_out >= p_from and fr.first_human_out < p_to
    group by c.assigned_to_user_id
  ),
  attendant_ids as (
    select user_id from lead_agg
    union select user_id from conv_agg
    union select user_id from ttfr
  )
  select jsonb_build_object(
    'funnel', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', s.id,
          'stage_name', s.name,
          'position', s.position,
          'count', coalesce(l.cnt, 0)
        ) order by s.position, s.name
      )
      from public.crm_stages s
      left join (
        select stage_id, count(*) as cnt
        from public.crm_leads
        where organization_id = p_org
          and status = 'open'
          and (p_owner is null or owner_user_id = p_owner)
        group by stage_id
      ) l on l.stage_id = s.id
      where s.organization_id = p_org
        and s.is_archived = false
    ), '[]'::jsonb),
    'attendants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', a.user_id,
          'won', coalesce(la.won, 0),
          'lost', coalesce(la.lost, 0),
          'conversations_handled', coalesce(ca.conversations_handled, 0),
          'avg_first_response_seconds', tf.avg_first_response_seconds
        ) order by coalesce(la.won, 0) desc, a.user_id
      )
      from attendant_ids a
      left join lead_agg la on la.user_id = a.user_id
      left join conv_agg ca on ca.user_id = a.user_id
      left join ttfr tf on tf.user_id = a.user_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.fn_attendant_metrics(uuid, timestamptz, timestamptz, uuid) from public;

revoke execute on function public.fn_attendant_metrics(uuid, timestamptz, timestamptz, uuid) from anon;

grant execute on function public.fn_attendant_metrics(uuid, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

create table if not exists public.webhook_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  path_token text not null unique,
  secret text,
  kind text not null default 'lead_capture' check (kind in ('lead_capture')),
  default_pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  default_stage_id uuid not null references public.crm_stages(id) on delete cascade,
  field_map jsonb not null default '{}'::jsonb,
  redirect_to text,
  is_active boolean not null default true,
  last_received_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_event text not null
    check (trigger_event ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  last_run_at timestamptz,
  run_count integer not null default 0,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_rules_org_trigger
  on public.automation_rules (organization_id, trigger_event)
  where is_active;

create table if not exists public.automation_rule_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  event_id uuid references public.event_log(id) on delete set null,
  status text not null check (status in ('success', 'partial', 'failed')),
  actions_result jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_rule_runs_org_created
  on public.automation_rule_runs (organization_id, created_at desc);

create index if not exists idx_automation_rule_runs_rule
  on public.automation_rule_runs (rule_id, created_at desc);

alter table public.webhook_sources enable row level security;

alter table public.automation_rules enable row level security;

alter table public.automation_rule_runs enable row level security;

drop policy if exists "webhook_sources_select" on public.webhook_sources;

drop policy if exists "webhook_sources_manager_write" on public.webhook_sources;

create policy "webhook_sources_select" on public.webhook_sources
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "webhook_sources_manager_write" on public.webhook_sources
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists "automation_rules_select" on public.automation_rules;

drop policy if exists "automation_rules_manager_write" on public.automation_rules;

create policy "automation_rules_select" on public.automation_rules
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "automation_rules_manager_write" on public.automation_rules
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists "automation_rule_runs_select" on public.automation_rule_runs;

create policy "automation_rule_runs_select" on public.automation_rule_runs
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create table if not exists public.attendant_availability (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references neon_auth.user(id) on delete cascade,
  is_available      boolean not null default false,
  capacity          integer not null default 5 check (capacity > 0),
  schedule          jsonb not null default '{}',
  last_heartbeat_at timestamptz,
  updated_at        timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_attendant_availability_available
  on public.attendant_availability (organization_id)
  where is_available;

alter table public.attendant_availability enable row level security;

drop policy if exists "attendant_availability_select" on public.attendant_availability;

create policy "attendant_availability_select" on public.attendant_availability
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "attendant_availability_insert" on public.attendant_availability;

create policy "attendant_availability_insert" on public.attendant_availability
  for insert with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

drop policy if exists "attendant_availability_update" on public.attendant_availability;

create policy "attendant_availability_update" on public.attendant_availability
  for update using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  ) with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

drop policy if exists "attendant_availability_delete" on public.attendant_availability;

create policy "attendant_availability_delete" on public.attendant_availability
  for delete using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

create table if not exists public.attendant_availability (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references neon_auth.user(id) on delete cascade,
  is_available      boolean not null default false,
  capacity          integer not null default 5 check (capacity > 0),
  schedule          jsonb not null default '{}',
  last_heartbeat_at timestamptz,
  updated_at        timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_attendant_availability_available
  on public.attendant_availability (organization_id)
  where is_available;

alter table public.attendant_availability enable row level security;

drop policy if exists "attendant_availability_select" on public.attendant_availability;

create policy "attendant_availability_select" on public.attendant_availability
  for select using (
    public.fn_is_platform_admin()
    or organization_id in (select public.fn_user_org_ids())
  );

drop policy if exists "attendant_availability_insert" on public.attendant_availability;

create policy "attendant_availability_insert" on public.attendant_availability
  for insert with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

drop policy if exists "attendant_availability_update" on public.attendant_availability;

create policy "attendant_availability_update" on public.attendant_availability
  for update using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  ) with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

drop policy if exists "attendant_availability_delete" on public.attendant_availability;

create policy "attendant_availability_delete" on public.attendant_availability
  for delete using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and (user_id = auth.uid()
             or public.fn_role_at_least(organization_id, 'manager')))
  );

create or replace function public.fn_emit_conversation_routing() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.emit_event(
    'conversation.routing_requested',
    'conversation',
    new.id,
    jsonb_build_object('conversation_id', new.id, 'organization_id', new.organization_id),
    '{}'::jsonb,
    new.organization_id
  );
  return null;
end;
$$;

drop trigger if exists trg_conversation_routing_requested on public.conversations;

create trigger trg_conversation_routing_requested
  after insert on public.conversations
  for each row
  when (new.assigned_to_user_id is null and new.status in ('open', 'pending'))
  execute function public.fn_emit_conversation_routing();

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema private from public;

revoke all on all tables in schema private from public;

create or replace function private.fn_oauth_key() returns text
    language sql security definer
    set search_path to 'private', 'pg_temp'
    as $$
  select coalesce(
    nullif(current_setting('app.nuvemshop_oauth_key', true), ''),
    (select value from private.app_secrets where name = 'nuvemshop_oauth_key')
  );
$$;

revoke all on function private.fn_oauth_key() from public;

create or replace function public.fn_encrypt_oauth(plaintext text) returns bytea
    language plpgsql security definer
    set search_path to 'public', 'private', 'extensions', 'pg_temp'
    as $$
declare
  k text := private.fn_oauth_key();
begin
  if k is null or length(k) < 32 then
    raise exception 'NUVEMSHOP_OAUTH_ENCRYPTION_KEY ausente';
  end if;
  return pgp_sym_encrypt(plaintext, k, 'cipher-algo=aes256');
end$$;

create or replace function public.fn_decrypt_oauth(ciphertext bytea) returns text
    language plpgsql security definer
    set search_path to 'public', 'private', 'extensions', 'pg_temp'
    as $$
declare
  k text := private.fn_oauth_key();
begin
  return pgp_sym_decrypt(ciphertext, k);
end$$;

revoke all on function public.fn_encrypt_oauth(text) from public;

revoke all on function public.fn_decrypt_oauth(bytea) from public;

grant execute on function public.fn_encrypt_oauth(text) to service_role;

grant execute on function public.fn_decrypt_oauth(bytea) to service_role;

alter table public.webhook_sources
  add column if not exists secret_encrypted bytea;

do $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
  has_plain boolean;
  n_dropped int;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'webhook_sources' and column_name = 'secret'
  ) into has_plain;
  if not has_plain then
    return; -- já migrado
  end if;
  if k is not null and length(k) >= 32 then
    update public.webhook_sources
      set secret_encrypted = public.fn_encrypt_oauth(secret)
      where secret is not null and secret_encrypted is null;
  else
    select count(*) into n_dropped from public.webhook_sources where secret is not null;
    if n_dropped > 0 then
      raise warning 'webhook_sources: % secret(s) plaintext descartado(s) — GUC app.nuvemshop_oauth_key ausente; re-configure os secrets pela UI', n_dropped;
    end if;
  end if;
  alter table public.webhook_sources drop column secret;
end$$;

do $$
declare
  k text := current_setting('app.nuvemshop_oauth_key', true);
  r record;
  new_actions jsonb;
  a jsonb;
  n_dropped int := 0;
begin
  for r in
    select id, actions from public.automation_rules
    where actions::text like '%"secret"%'
  loop
    new_actions := '[]'::jsonb;
    for a in select * from jsonb_array_elements(r.actions) loop
      if a->>'type' = 'call_webhook' and (a->'config') ? 'secret' then
        if k is not null and length(k) >= 32 then
          a := jsonb_set(
            a #- '{config,secret}',
            '{config,secret_enc}',
            to_jsonb(encode(public.fn_encrypt_oauth(a#>>'{config,secret}'), 'hex'))
          );
        else
          a := a #- '{config,secret}';
          n_dropped := n_dropped + 1;
        end if;
      end if;
      new_actions := new_actions || jsonb_build_array(a);
    end loop;
    update public.automation_rules set actions = new_actions, updated_at = now()
      where id = r.id;
  end loop;
  if n_dropped > 0 then
    raise warning 'automation_rules: % secret(s) de call_webhook descartado(s) — GUC app.nuvemshop_oauth_key ausente; re-configure pela UI', n_dropped;
  end if;
end$$;

create or replace function public.fn_emit_event_on_lead_change() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  if tg_op = 'INSERT' then
    -- lead.created é emitido pelo createLeadHandler (entity_kind='crm_lead').
    return new;
  end if;
  -- lead.stage_changed é emitido pelo moveLeadHandler (entity_kind='crm_lead').
  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform public.fn_log_event(new.organization_id, 'lead.won',
        jsonb_build_object('lead_id', new.id, 'value_cents', new.value_cents));
    elsif new.status = 'lost' then
      perform public.fn_log_event(new.organization_id, 'lead.lost',
        jsonb_build_object('lead_id', new.id, 'lost_reason', new.lost_reason));
    elsif new.status = 'open' then
      perform public.fn_log_event(new.organization_id, 'lead.reopened',
        jsonb_build_object('lead_id', new.id));
    end if;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    perform public.fn_log_event(new.organization_id, 'lead.assigned',
      jsonb_build_object('lead_id', new.id, 'from_user_id', old.owner_user_id, 'to_user_id', new.owner_user_id));
  end if;
  return new;
end$$;

drop trigger if exists trg_emit_event_on_lead_change on public.crm_leads;

create trigger trg_emit_event_on_lead_change
  after update on public.crm_leads
  for each row execute function public.fn_emit_event_on_lead_change();

update public.event_log
  set status = 'done', updated_at = now()
  where status = 'pending'
    and entity_kind = 'lead'
    and event_type in ('lead.created', 'lead.stage_changed');

drop policy if exists "tenant_isolation_crm_lead_activities_select" on public.crm_lead_activities;

drop policy if exists "tenant_isolation_crm_lead_activities_insert" on public.crm_lead_activities;

drop policy if exists "crm_lead_activities_select" on public.crm_lead_activities;

drop policy if exists "crm_lead_activities_insert" on public.crm_lead_activities;

create policy "crm_lead_activities_select" on public.crm_lead_activities
  for select using (
    exists (
      select 1 from public.crm_leads l
      where l.id = crm_lead_activities.lead_id
        and public.fn_can_view_lead(l.organization_id, l.owner_user_id)
    )
  );

create policy "crm_lead_activities_insert" on public.crm_lead_activities
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists "tenant_isolation_crm_lead_links_all" on public.crm_lead_links;

drop policy if exists "crm_lead_links_select" on public.crm_lead_links;

drop policy if exists "crm_lead_links_insert" on public.crm_lead_links;

drop policy if exists "crm_lead_links_update" on public.crm_lead_links;

drop policy if exists "crm_lead_links_delete" on public.crm_lead_links;

create policy "crm_lead_links_select" on public.crm_lead_links
  for select using (
    exists (
      select 1 from public.crm_leads l
      where l.id = crm_lead_links.lead_id
        and public.fn_can_view_lead(l.organization_id, l.owner_user_id)
    )
  );

create policy "crm_lead_links_insert" on public.crm_lead_links
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_lead_links_update" on public.crm_lead_links
  for update using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_lead_links_delete" on public.crm_lead_links
  for delete using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

drop policy if exists "user_orgs_select" on public.user_organizations;

create policy "user_orgs_select" on public.user_organizations
  for select using (
    (user_id = auth.uid())
    or public.fn_role_at_least(organization_id, 'manager')
    or public.fn_is_platform_admin()
  );

select pg_catalog.set_config('search_path', 'public, extensions', false);

create table if not exists agent_inbox_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  kind text not null check (kind in
    ('qr_rescan','job_dead','event_dead','budget_exceeded','handoff',
     'promotion_review','judge_unaligned','other')),
  severity text not null default 'warn' check (severity in ('info','warn','critical')),
  title text not null,
  body text,
  ref_kind text,
  ref_id uuid,
  status text not null default 'open' check (status in ('open','ack','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_inbox_items_open on agent_inbox_items (organization_id, created_at desc)
  where status = 'open';

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade, 
  kind text not null check (kind in ('inbound_turn','followup_turn','watchdog','flywheel')),
  source_event_id uuid,                
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','running','done','failed','dead')),
  priority smallint not null default 100,
  run_after timestamptz not null default now(),
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  last_error text,                     
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind in ('inbound_turn','followup_turn')) = (contact_id is not null))
);

create index if not exists idx_job_queue_claim on job_queue (status, run_after) where status = 'pending';

create unique index if not exists uniq_job_queue_one_running_per_contact on job_queue (contact_id)
  where status = 'running' and contact_id is not null;

create unique index if not exists uniq_job_queue_source_event on job_queue (organization_id, source_event_id)
  where source_event_id is not null;

create table if not exists send_ledger (
  id uuid primary key default gen_random_uuid(), 
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  job_id uuid not null references job_queue(id) on delete cascade,
  seq smallint not null,
  body_hash text not null,
  status text not null default 'requested'
    check (status in ('requested','accepted','queued','vetoed','failed')),
  crm_message_id uuid,                 
  last_error text,                     
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, seq)
);

create index if not exists idx_send_ledger_recent on send_ledger (organization_id, created_at desc);

create or replace function fn_agent_versions_immutable() returns trigger
language plpgsql as $fn$
begin
  raise exception '% é imutável: mudança = versão nova; rollback = mover o ponteiro (%)',
    tg_table_name, replace(tg_table_name, '_versions', '_pointers');
end;
$fn$;

create table if not exists playbook_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, 
  layer text not null check (layer in ('platform', 'tenant', 'campaign')),
  content text not null,
  created_at timestamptz not null default now(),
  check ((layer = 'platform') = (organization_id is null))
);

drop trigger if exists trg_playbook_versions_immutable on playbook_versions;

create trigger trg_playbook_versions_immutable
  before update on playbook_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists playbook_pointers (
  organization_id uuid references organizations(id) on delete cascade, 
  layer text not null check (layer in ('platform', 'tenant', 'campaign')),
  version_id uuid not null references playbook_versions(id),
  updated_at timestamptz not null default now(),
  check ((layer = 'platform') = (organization_id is null))
);

create unique index if not exists uniq_playbook_pointers_org
  on playbook_pointers (organization_id, layer) where organization_id is not null;

create unique index if not exists uniq_playbook_pointers_platform
  on playbook_pointers (layer) where organization_id is null;

create table if not exists channel_session_health (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  status text not null,
  status_changed_at timestamptz not null default now(),
  escalated_status text,
  health_hold_active boolean not null default false,
  health_hold_reason text,          
  health_held_at timestamptz,       
  health_released_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, channel_session_id)
);

create table if not exists watchdog_cursors (
  consumer text primary key,
  last_created_at timestamptz not null default 'epoch',
  last_event_id uuid not null default '00000000-0000-0000-0000-000000000000',
  updated_at timestamptz not null default now()
);

create table if not exists llm_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  job_id uuid references job_queue(id) on delete set null,
  variant_id uuid,                       
  purpose text not null default 'agent_turn',  
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,   
  cache_write_tokens int not null default 0,
  cost_cents numeric,                    
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_llm_calls_org_time on llm_calls (organization_id, created_at);

create table if not exists lead_checkpoints (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  job_id uuid references job_queue(id) on delete set null, 
  commitments jsonb not null default '[]',      
  objections jsonb not null default '[]',       
  next_action text,
  rolling_summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_checkpoints_latest
  on lead_checkpoints (organization_id, contact_id, seq desc);

create table if not exists lead_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  stage text not null default 'new' check (stage in
    ('new','contacted','qualifying','qualified','negotiating','won','lost')),
  qualification jsonb not null default '{}',
  next_action text,
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id)
);

create table if not exists lead_state_transitions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  job_id uuid references job_queue(id) on delete set null,
  from_stage text not null,
  to_stage text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_state_transitions_contact
  on lead_state_transitions (organization_id, contact_id, seq desc);

create table if not exists metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, 
  name text not null,
  labels jsonb not null default '{}',
  value double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_metrics_name_time on metrics (name, created_at desc);

create index if not exists idx_metrics_org_name_time on metrics (organization_id, name, created_at desc);

create table if not exists channel_knobs (
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  throttle_ms integer,                
  jitter_max_ms integer,              
  window_start_hour smallint,         
  window_end_hour smallint,
  allow_sunday boolean,               
  timezone text,                      
  warmup_daily_caps jsonb
    constraint channel_knobs_warmup_caps_is_array
    check (
      warmup_daily_caps is null
      or (jsonb_typeof(warmup_daily_caps) = 'array' and jsonb_array_length(warmup_daily_caps) > 0)
    ),
  spinning_knobs jsonb
    constraint channel_knobs_spinning_is_object
    check (spinning_knobs is null or jsonb_typeof(spinning_knobs) = 'object'),
  health_knobs jsonb
    constraint channel_knobs_health_is_object
    check (health_knobs is null or jsonb_typeof(health_knobs) = 'object'),
  number_activated_at timestamptz not null default now(), 
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, channel_session_id)
);

create table if not exists pacing_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists idx_pacing_ledger_session
  on pacing_ledger (organization_id, channel_session_id, sent_at desc);

create table if not exists outbound_copies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  normalized_text text not null,      
  normalized_hash text not null,      
  sent_at timestamptz not null default now()
);

create index if not exists idx_outbound_copies_session
  on outbound_copies (organization_id, channel_session_id, sent_at desc);

create table if not exists cron_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('at','every','cron')),
  interval_ms bigint check (interval_ms is null or interval_ms > 0),
  cron_expr text,
  tz text not null default 'UTC',
  job_kind text not null default 'followup_turn'
    check (job_kind in ('inbound_turn','followup_turn','watchdog','flywheel')),
  payload jsonb not null default '{}',
  next_run_at timestamptz not null,
  enabled boolean not null default true,
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  last_error text,                        
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'every' or interval_ms is not null),
  check (kind <> 'cron' or cron_expr is not null)
);

create index if not exists idx_cron_jobs_due on cron_jobs (next_run_at)
  where enabled = true;

create table if not exists reentry_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  variants text[] not null check (array_length(variants, 1) >= 1),
  created_at timestamptz not null default now()
);

drop trigger if exists trg_reentry_template_versions_immutable on reentry_template_versions;

create trigger trg_reentry_template_versions_immutable
  before update on reentry_template_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists reentry_template_pointers (
  organization_id uuid primary key references organizations(id) on delete cascade,
  version_id uuid not null references reentry_template_versions(id),
  updated_at timestamptz not null default now()
);

create table if not exists lead_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  headline text not null check (length(headline) > 0), 
  body text not null check (length(body) > 0),         
  embedding jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lead_notes_contact
  on lead_notes (organization_id, contact_id, created_at);

create table if not exists skill_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, 
  name text not null check (length(name) > 0),
  description text not null check (length(description) > 0),
  body text not null check (length(body) > 0), 
  matcher jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_skill_versions_immutable on skill_versions;

create trigger trg_skill_versions_immutable
  before update on skill_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists skill_pointers (
  organization_id uuid references organizations(id) on delete cascade, 
  name text not null check (length(name) > 0),
  version_id uuid not null references skill_versions(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_skill_pointers_org
  on skill_pointers (organization_id, name) where organization_id is not null;

create unique index if not exists uniq_skill_pointers_platform
  on skill_pointers (name) where organization_id is null;

create table if not exists promise_table_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  values jsonb not null,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_promise_table_versions_immutable on promise_table_versions;

create trigger trg_promise_table_versions_immutable
  before update on promise_table_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists promise_table_pointers (
  organization_id uuid not null references organizations(id) on delete cascade,
  version_id uuid not null references promise_table_versions(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_promise_table_pointers_org
  on promise_table_pointers (organization_id);

create table if not exists disclosure_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  body text not null, 
  created_at timestamptz not null default now()
);

drop trigger if exists trg_disclosure_template_versions_immutable on disclosure_template_versions;

create trigger trg_disclosure_template_versions_immutable
  before update on disclosure_template_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists disclosure_template_pointers (
  organization_id uuid not null references organizations(id) on delete cascade,
  version_id uuid not null references disclosure_template_versions(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_disclosure_template_pointers_org
  on disclosure_template_pointers (organization_id);

create table if not exists before_send_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references job_queue(id) on delete cascade, 
  contact_id uuid references contacts(id) on delete cascade,
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  trace jsonb not null,
  vetoed_gate text,
  vetoed_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_before_send_traces_run
  on before_send_traces (organization_id, job_id, created_at);

create table if not exists flywheel_judge_verdicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dataset text not null,               
  trace_id text not null,
  dimension text not null,
  verdict text not null check (verdict in ('yes', 'no', 'unknown')),
  option_order text not null,          
  judge_family text not null,
  model text not null,
  provenance jsonb not null default '{}',
  run_id uuid not null,                
  judged_at timestamptz not null default now()
);

create unique index if not exists uq_flywheel_judge_verdicts_key
  on flywheel_judge_verdicts (dataset, trace_id, dimension);

create index if not exists idx_flywheel_judge_verdicts_run
  on flywheel_judge_verdicts (organization_id, run_id);

create index if not exists idx_flywheel_judge_verdicts_dataset
  on flywheel_judge_verdicts (dataset, dimension);

create table if not exists flywheel_distiller_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  run_id uuid not null,
  dataset text not null,
  type text not null check (type in ('playbook_bullet', 'golden_case', 'reentry_trigger')),
  target text not null,                
  content text not null check (length(content) > 0), 
  evidence jsonb not null,             
  proposed_at timestamptz not null default now()
);

create index if not exists idx_flywheel_distiller_proposals_run
  on flywheel_distiller_proposals (organization_id, run_id);

create index if not exists idx_flywheel_distiller_proposals_dataset
  on flywheel_distiller_proposals (dataset, type);

create table if not exists judge_alignment_pool (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  dataset text not null,
  trace_id text not null,
  dimension text not null,
  added_at timestamptz not null default now()
);

create unique index if not exists uq_judge_alignment_pool_key
  on judge_alignment_pool (dataset, trace_id, dimension);

create index if not exists idx_judge_alignment_pool_dim
  on judge_alignment_pool (organization_id, dimension);

create table if not exists reentry_knob_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  knobs jsonb not null,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_reentry_knob_versions_immutable on reentry_knob_versions;

create trigger trg_reentry_knob_versions_immutable
  before update on reentry_knob_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists reentry_knob_pointers (
  organization_id uuid primary key references organizations(id) on delete cascade,
  version_id uuid not null references reentry_knob_versions(id),
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_inbox_items', 'job_queue', 'send_ledger',
    'playbook_versions', 'playbook_pointers',
    'channel_session_health', 'llm_calls',
    'lead_checkpoints', 'lead_state', 'lead_state_transitions',
    'metrics', 'channel_knobs', 'pacing_ledger', 'outbound_copies',
    'cron_jobs',
    'reentry_template_versions', 'reentry_template_pointers',
    'lead_notes', 'skill_versions', 'skill_pointers',
    'promise_table_versions', 'promise_table_pointers',
    'disclosure_template_versions', 'disclosure_template_pointers',
    'before_send_traces',
    'flywheel_judge_verdicts', 'flywheel_distiller_proposals',
    'judge_alignment_pool',
    'reentry_knob_versions', 'reentry_knob_pointers'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format(
      'create policy tenant_isolation_%s_all on public.%I for all
         using (organization_id in (select * from public.fn_user_org_ids()))
         with check (organization_id in (select * from public.fn_user_org_ids()))',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end
$$;

alter table watchdog_cursors enable row level security;

revoke all on watchdog_cursors from anon;

create or replace function fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  -- Conteúdo congelado fora de draft. Campos de lifecycle ficam de fora do
  -- veto de propósito: status/published_at/superseded_at mudam no publish.
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;

create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function fn_ai_agent_version_content_immutable();

create or replace function public.fn_publish_ai_agent_version(
  p_org_id uuid,
  p_agent_id uuid,
  p_version_id uuid
)
returns table (
  agent_id uuid,
  version_id uuid,
  previous_version_id uuid,
  published_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agent record;
  v_version record;
  v_credential record;
  v_session record;
  v_model_count integer;
  v_previous_version_id uuid;
  v_published_at timestamptz := now();
begin
  select a.id, a.organization_id, a.published_version_id, a.archived_at
    into v_agent
  from public.ai_agents a
  where a.id = p_agent_id
  for update;
  if not found then
    raise exception 'agent_not_found' using errcode = 'P0001';
  end if;
  if v_agent.organization_id <> p_org_id then
    raise exception 'agent_not_found' using errcode = 'P0001';
  end if;
  if v_agent.archived_at is not null then
    raise exception 'agent_archived' using errcode = 'P0001';
  end if;
  select v.id, v.organization_id, v.agent_id, v.status, v.provider, v.model,
         v.credential_id, v.channel_session_id
    into v_version
  from public.ai_agent_versions v
  where v.id = p_version_id
  for update;
  if not found then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  if v_version.agent_id <> p_agent_id or v_version.organization_id <> p_org_id then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  if v_version.status not in ('draft', 'superseded') then
    raise exception 'version_invalid_state' using errcode = 'P0001';
  end if;
  if v_version.credential_id is null then
    raise exception 'credential_missing' using errcode = 'P0001';
  end if;
  select c.id, c.organization_id, c.provider, c.is_active, c.validated_at
    into v_credential
  from public.ai_provider_credentials c
  where c.id = v_version.credential_id;
  if not found or v_credential.organization_id <> p_org_id then
    raise exception 'credential_not_found' using errcode = 'P0001';
  end if;
  if not v_credential.is_active then
    raise exception 'credential_inactive' using errcode = 'P0001';
  end if;
  if v_credential.validated_at is null then
    raise exception 'credential_not_validated' using errcode = 'P0001';
  end if;
  if v_credential.provider <> v_version.provider then
    raise exception 'credential_provider_mismatch' using errcode = 'P0001';
  end if;
  select s.id, s.organization_id, s.status
    into v_session
  from public.channel_sessions s
  where s.id = v_version.channel_session_id;
  if not found or v_session.organization_id <> p_org_id then
    raise exception 'channel_session_not_found' using errcode = 'P0001';
  end if;
  if v_session.status <> 'WORKING' then
    raise exception 'channel_session_offline' using errcode = 'P0001';
  end if;
  select count(*)
    into v_model_count
  from public.ai_models m
  where m.provider = v_version.provider
    and m.model_id = v_version.model
    and m.deprecated_at is null;
  if v_model_count = 0 then
    raise exception 'model_not_found' using errcode = 'P0001';
  end if;
  v_previous_version_id := v_agent.published_version_id;
  if v_previous_version_id is not null and v_previous_version_id <> p_version_id then
    update public.ai_agent_versions
       set status = 'superseded', superseded_at = v_published_at
     where id = v_previous_version_id;
  end if;
  update public.ai_agent_versions
     set status = 'published',
         published_at = v_published_at,
         superseded_at = null
   where id = p_version_id;
  update public.ai_agents
     set published_version_id = p_version_id,
         updated_at = v_published_at
   where id = p_agent_id;
  return query
    select p_agent_id, p_version_id, v_previous_version_id, v_published_at;
end;
$$;

alter table flywheel_distiller_proposals
  add column if not exists applied_at timestamptz,
  add column if not exists applied_version_id uuid references ai_agent_versions(id) on delete set null,
  add column if not exists applied_by uuid;

create table if not exists followup_flow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  graph jsonb not null,
  created_by uuid references neon_auth.user(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists followup_flow_pointers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','disabled')),
  active_version_id uuid references followup_flow_versions(id),
  draft_graph jsonb,
  handoff_policy text not null default 'pause' check (handoff_policy in ('pause','cancel','allow')),
  trigger_config jsonb not null default '{"kind":"manual"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists followup_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pointer_id uuid not null references followup_flow_pointers(id) on delete cascade,
  version_id uuid not null references followup_flow_versions(id),
  contact_id uuid not null references contacts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  current_node_id text not null,
  status text not null default 'active'
    check (status in ('active','waiting_reply','paused_handoff','completed','cancelled','dead')),
  next_eval_at timestamptz,
  claimed_until timestamptz,
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  last_error text,
  steps_taken smallint not null default 0,
  outcome text check (outcome in ('converted','replied','exhausted','opted_out','handoff')),
  cancel_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status in ('active','waiting_reply') and next_eval_at is not null)
    or (status in ('paused_handoff','completed','cancelled','dead'))
  )
);

create index if not exists idx_followup_enrollments_due
  on followup_enrollments (next_eval_at)
  where status in ('active','waiting_reply');

create unique index if not exists idx_followup_enrollments_one_live
  on followup_enrollments (pointer_id, contact_id)
  where status in ('active','waiting_reply','paused_handoff');

create index if not exists idx_followup_enrollments_contact
  on followup_enrollments (organization_id, contact_id);

create table if not exists followup_enrollment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  enrollment_id uuid not null references followup_enrollments(id) on delete cascade,
  node_id text,
  event_type text not null,
  payload jsonb not null default '{}',
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_followup_events_idem
  on followup_enrollment_events (enrollment_id, idempotency_key)
  where idempotency_key is not null;

alter table followup_flow_versions enable row level security;

alter table followup_flow_pointers enable row level security;

alter table followup_enrollments enable row level security;

alter table followup_enrollment_events enable row level security;

do $$ begin
  create policy tenant_isolation_followup_flow_versions_all on followup_flow_versions
    for all using (organization_id in (select fn_user_org_ids()))
    with check (organization_id in (select fn_user_org_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation_followup_flow_pointers_all on followup_flow_pointers
    for all using (organization_id in (select fn_user_org_ids()))
    with check (organization_id in (select fn_user_org_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation_followup_enrollments_all on followup_enrollments
    for all using (organization_id in (select fn_user_org_ids()))
    with check (organization_id in (select fn_user_org_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation_followup_enrollment_events_all on followup_enrollment_events
    for all using (organization_id in (select fn_user_org_ids()))
    with check (organization_id in (select fn_user_org_ids()));
exception when duplicate_object then null; end $$;

create or replace function fn_claim_due_followup_enrollments(p_limit int, p_lease_seconds int)
returns setof followup_enrollments
language sql
security definer
set search_path = public
as $$
  update followup_enrollments e
  set claimed_until = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where e.id in (
    select id from followup_enrollments
    where status in ('active','waiting_reply')
      and next_eval_at <= now()
      and (claimed_until is null or claimed_until < now())
    order by next_eval_at
    limit p_limit
    for update skip locked
  )
  returning e.*;
$$;

revoke all on function fn_claim_due_followup_enrollments(int, int) from public, anon, authenticated;

alter table followup_flow_versions
  add column if not exists pointer_id uuid references followup_flow_pointers(id) on delete cascade;

update followup_flow_versions v
set pointer_id = p.id
from followup_flow_pointers p
where p.active_version_id = v.id
  and v.pointer_id is null;

create index if not exists idx_followup_versions_pointer
  on followup_flow_versions (pointer_id);

create or replace function fn_publish_followup_flow_version(
  p_org uuid,
  p_pointer uuid,
  p_graph jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pointer record;
  v_version_id uuid;
begin
  select p.id, p.organization_id
    into v_pointer
  from followup_flow_pointers p
  where p.id = p_pointer
  for update;
  if not found or v_pointer.organization_id <> p_org then
    raise exception 'pointer_not_found' using errcode = 'P0001';
  end if;
  insert into followup_flow_versions (organization_id, pointer_id, graph, created_by)
  values (p_org, p_pointer, p_graph, p_created_by)
  returning id into v_version_id;
  update followup_flow_pointers
     set active_version_id = v_version_id,
         status = 'active',
         updated_at = now()
   where id = p_pointer;
  return v_version_id;
end;
$$;

revoke all on function fn_publish_followup_flow_version(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

alter table ai_agent_versions
  add column if not exists followup jsonb not null default '{"enabled": false, "flow_pointer_ids": []}'::jsonb;

create or replace function fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;

create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function fn_ai_agent_version_content_immutable();

with ranked as (
  select id,
         row_number() over (
           partition by organization_id, contact_id
           order by started_at desc, id desc
         ) as rn
  from followup_enrollments
  where status in ('active', 'waiting_reply', 'paused_handoff')
)
update followup_enrollments e
set status = 'cancelled',
    cancel_reason = 'exclusivity_backfill',
    next_eval_at = null,
    updated_at = now()
from ranked
where e.id = ranked.id
  and ranked.rn > 1;

drop index if exists idx_followup_enrollments_one_live;

create unique index if not exists idx_followup_enrollments_one_live
  on followup_enrollments (organization_id, contact_id)
  where status in ('active', 'waiting_reply', 'paused_handoff');

alter table followup_enrollments
  add column if not exists agent_id uuid references ai_agents(id) on delete set null;

create index if not exists idx_followup_enrollments_agent
  on followup_enrollments (agent_id);

alter table messages
  add column if not exists media_derived_text text,
  add column if not exists media_derived_status text;

alter table ai_agent_versions
  add column if not exists multimodal_input boolean not null default true,
  add column if not exists video_frames_enabled boolean not null default false;

alter table ai_agent_versions
  add column if not exists split_messages boolean not null default false,
  add column if not exists split_max_chars integer not null default 600;

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid references neon_auth.user(id) on delete cascade,
  title text not null,
  body text not null,
  shortcut text,
  created_by_user_id uuid references neon_auth.user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_message_templates_org on message_templates (organization_id);

alter table message_templates enable row level security;

drop policy if exists "message_templates_select" on message_templates;

create policy "message_templates_select" on message_templates
  for select using (
    (
      organization_id in (select fn_user_org_ids())
      and (owner_user_id is null or owner_user_id = auth.uid())
    )
    or fn_is_platform_admin()
  );

drop policy if exists "message_templates_write" on message_templates;

create policy "message_templates_write" on message_templates
  for all using (
    organization_id in (select fn_user_org_ids())
    and (
      (owner_user_id = auth.uid() and fn_role_at_least(organization_id, 'agent'))
      or (owner_user_id is null and fn_role_at_least(organization_id, 'manager'))
    )
  )
  with check (
    organization_id in (select fn_user_org_ids())
    and (
      (owner_user_id = auth.uid() and fn_role_at_least(organization_id, 'agent'))
      or (owner_user_id is null and fn_role_at_least(organization_id, 'manager'))
    )
  );

alter table conversations
  add column if not exists snooze_until timestamptz,
  add column if not exists snoozed_by_user_id uuid references neon_auth.user(id) on delete set null,
  add column if not exists snoozed_at timestamptz;

create index if not exists idx_conversations_snooze_until
  on conversations (snooze_until) where snooze_until is not null;

create table if not exists conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  body text not null,
  created_by_user_id uuid references neon_auth.user(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_notes_conversation
  on conversation_notes (conversation_id, created_at);

alter table conversation_notes enable row level security;

drop policy if exists "conversation_notes_select" on conversation_notes;

create policy "conversation_notes_select" on conversation_notes
  for select using (
    organization_id in (select fn_user_org_ids()) or fn_is_platform_admin()
  );

drop policy if exists "conversation_notes_write" on conversation_notes;

create policy "conversation_notes_write" on conversation_notes
  for all using (
    organization_id in (select fn_user_org_ids()) and fn_role_at_least(organization_id, 'agent')
  )
  with check (
    organization_id in (select fn_user_org_ids()) and fn_role_at_least(organization_id, 'agent')
  );

create table if not exists agent_cases (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete set null,
  agent_id uuid references ai_agents(id) on delete set null,
  status text not null default 'awaiting_human'
    check (status in ('awaiting_human','awaiting_lead','resolved','escalated','cancelled')),
  title text not null,
  summary text not null,
  blocker text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  source text not null default 'agent' check (source in ('agent','guardrail_autofallback')),
  followup_attempts smallint not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_cases_open_idx
  on agent_cases (organization_id, status) where status in ('awaiting_human','awaiting_lead');

create index if not exists agent_cases_lead_idx on agent_cases (organization_id, lead_id);

create index if not exists agent_cases_conv_idx on agent_cases (organization_id, conversation_id);

create table if not exists agent_case_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  case_id uuid not null references agent_cases(id) on delete cascade,
  kind text not null check (kind in
    ('opened','human_replied','lead_asked','lead_provided','lead_unresponsive','resolved','escalated','cancelled')),
  actor_kind text not null check (actor_kind in ('agent','human','system','lead')),
  actor_user_id uuid references neon_auth.user(id) on delete set null,
  human_action text check (human_action in ('resolved','need_lead_info','escalate')),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_case_events_case_idx on agent_case_events (case_id, created_at);

alter table ai_agent_versions add column if not exists cases_enabled boolean not null default false;

alter table agent_cases enable row level security;

alter table agent_case_events enable row level security;

drop policy if exists tenant_isolation_agent_cases_all on agent_cases;

create policy tenant_isolation_agent_cases_all on agent_cases
  for all using (organization_id in (select fn_user_org_ids())) with check (organization_id in (select fn_user_org_ids()));

drop policy if exists tenant_isolation_agent_case_events_select on agent_case_events;

create policy tenant_isolation_agent_case_events_select on agent_case_events
  for select using (organization_id in (select fn_user_org_ids()));

drop policy if exists tenant_isolation_agent_case_events_insert on agent_case_events;

create policy tenant_isolation_agent_case_events_insert on agent_case_events
  for insert with check (organization_id in (select fn_user_org_ids()));

alter table job_queue drop constraint if exists job_queue_kind_check;

alter table job_queue add constraint job_queue_kind_check
  check (kind in ('inbound_turn','followup_turn','watchdog','flywheel','case_reply_turn','operator_turn'));

alter table job_queue drop constraint if exists job_queue_turn_needs_contact;

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'job_queue'::regclass and contype='c'
     and pg_get_constraintdef(oid) ilike '%contact_id is not null%';
  if c is not null then execute format('alter table job_queue drop constraint %I', c); end if;
end $$;

alter table job_queue add constraint job_queue_turn_needs_contact
  check ((kind in ('inbound_turn','followup_turn','case_reply_turn','operator_turn')) = (contact_id is not null));

alter table cron_jobs drop constraint if exists cron_jobs_job_kind_check;

alter table cron_jobs add constraint cron_jobs_job_kind_check
  check (job_kind in ('inbound_turn','followup_turn','watchdog','flywheel','case_reply_turn'));

create table if not exists org_memory_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  version_number int not null,
  content text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, version_number)
);

drop trigger if exists trg_org_memory_versions_immutable on org_memory_versions;

create trigger trg_org_memory_versions_immutable
  before update on org_memory_versions
  for each row execute function fn_agent_versions_immutable();

create table if not exists org_memory_pointers (
  organization_id uuid not null unique references organizations(id) on delete cascade,
  version_id uuid not null references org_memory_versions(id),
  updated_at timestamptz not null default now()
);

create table if not exists org_memory_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null check (length(title) > 0),
  body text not null check (length(body) > 0),
  source text not null check (source in ('manual', 'flywheel')),
  status text not null default 'active' check (status in ('proposed', 'active', 'archived')),
  proposal_id uuid references flywheel_distiller_proposals(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_memory_entries_org_status
  on org_memory_entries (organization_id, status, created_at);

alter table flywheel_distiller_proposals drop constraint if exists flywheel_distiller_proposals_type_check;

alter table flywheel_distiller_proposals add constraint flywheel_distiller_proposals_type_check
  check (type in ('playbook_bullet', 'golden_case', 'reentry_trigger', 'org_memory_entry'));

do $$
declare t text;
begin
  foreach t in array array['org_memory_versions', 'org_memory_pointers', 'org_memory_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format(
      'create policy tenant_isolation_%s_all on public.%I for all
         using (organization_id in (select * from public.fn_user_org_ids()))
         with check (organization_id in (select * from public.fn_user_org_ids()))',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table skill_versions add column if not exists manifest jsonb not null default '[]'::jsonb;

alter table skill_versions add column if not exists forked_from_version_id uuid references skill_versions(id) on delete set null;

create table if not exists skill_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  skill_name text not null,
  skill_version_id uuid references skill_versions(id) on delete set null,
  trigger text not null check (trigger in ('hard', 'probe')),
  job_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_skill_activations_org_created
  on skill_activations (organization_id, created_at);

create index if not exists idx_skill_activations_skill
  on skill_activations (organization_id, skill_name, created_at);

do $$
declare t text;
begin
  foreach t in array array['skill_activations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format(
      'create policy tenant_isolation_%s_all on public.%I for all
         using (organization_id in (select * from public.fn_user_org_ids()))
         with check (organization_id in (select * from public.fn_user_org_ids()))',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists catalog_read_skill_versions on skill_versions;

create policy catalog_read_skill_versions on skill_versions for select
  to authenticated using (organization_id is null);

drop policy if exists catalog_read_skill_pointers on skill_pointers;

create policy catalog_read_skill_pointers on skill_pointers for select
  to authenticated using (organization_id is null);

do $seed$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'objecao-preco'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'objecao-preco',
      'Playbook pra contornar objeção de preço no WhatsApp — diagnostica o motivo real por trás do "caro" antes de reagir, sem ceder desconto não autorizado.',
      $body$# Playbook: contornar objeção de preço
## Quando usar
O lead reagiu ao preço/valor com resistência — direta ("tá caro") ou indireta (pediu
desconto, comparou com concorrente, sumiu depois de saber o valor). Objetivo: entender
a objeção real por trás do "caro" antes de reagir, e nunca ceder desconto que a
organização não autorizou.
## Diagnóstico primeiro — "caro" quase nunca é sobre o número
Antes de responder, identifique QUAL objeção está por trás:
1. **Orçamento real insuficiente** — "não tenho esse valor agora", "tá fora do meu orçamento"
2. **Não enxergou o valor ainda** — "por que custa isso?", silêncio após o preço, comparação vaga
3. **Comparação com concorrente/opção mais barata** — "vi mais barato em [X]", "achei um mais em conta"
4. **Tática de negociação** — pede desconto de cara, sem ter perguntado nada sobre o produto antes
5. **Timing** — "vou pensar", "deixa eu ver com [sócio/cônjuge]" disfarçado de objeção de preço
Se não der pra diagnosticar pela mensagem, PERGUNTE antes de argumentar: "Só pra eu
te ajudar melhor — é o valor em si, ou você tava esperando algo diferente do que
ofereci?"
## If-then por diagnóstico
**SE orçamento real insuficiente:**
- Não insista no preço cheio. Ofereça: parcelamento, plano de entrada, versão
  reduzida — SÓ o que já estiver documentado como opção legítima na base de
  conhecimento do tenant.
- NUNCA invente parcelamento ou desconto que não está documentado — se não souber a
  política, faça handoff.
- Não deprecie o lead por não ter orçamento. Trate como informação, não como recusa.
**SE não enxergou valor ainda:**
- Não repita o preço. Reforce o resultado concreto que o cliente ganha (não a lista
  de features).
- Use um número ou prova social real se a base de conhecimento tiver ("cliente X
  reduziu Y em Z semanas").
- Pergunta de reengajamento: "Faz sentido pra você o que isso resolve, ou ficou
  alguma dúvida sobre o que está incluso?"
**SE comparação com concorrente:**
- Não ataque o concorrente. Pergunte o que ele viu de diferente ("o que tinha nessa
  outra opção?") — geralmente revela se é preço mesmo ou outro critério (prazo,
  suporte, garantia).
- Destaque o diferencial real do tenant (o que a base de conhecimento tiver de
  posicionamento), não genérico.
**SE tática de negociação (pediu desconto sem contexto):**
- Não ceda automaticamente. Pergunte o que faria sentido fechar hoje — muitas vezes
  revela o número real que o lead tem em mente.
- Desconto SÓ se a organização tiver uma política documentada na base de
  conhecimento (RAG) pra esse cenário. Sem isso, handoff — decisão de preço fora do
  script é gate humano.
**SE for timing disfarçado ("vou pensar"):**
- Não pressione. Pergunte objetivamente o que falta pra decidir ("o que te ajudaria
  a decidir com mais segurança agora?").
- Agende um follow-up explícito (data/hora), não deixe em aberto — lead que "vai
  pensar" sem follow-up marcado esfria.
## Regras duras
- Nunca prometa desconto, brinde ou condição especial que não esteja na base de
  conhecimento do tenant (RAG) ou explicitamente configurada no agente.
- Nunca minta sobre "promoção que acaba hoje" ou crie urgência falsa.
- Se o lead ficar hostil, ameaçar cancelar ou pedir falar com humano — handoff
  imediato, sem insistir mais uma vez.
- Se depois de 2 trocas de mensagem a objeção não resolver, ofereça handoff
  explicitamente: "Quer que eu chame alguém do time pra fechar os detalhes com
  você?"
## Exemplos de resposta (tom, não copiar literal)
- "Entendo — antes de eu te passar mais opção, me conta: é o valor em si ou esperava
  algo diferente do que te mostrei?"
- "Faz sentido. Sobre o valor, hoje temos [opção documentada]. Isso ajudaria a caber
  no seu momento?"
- "Show, deixa eu confirmar contigo: o que faria sentido fechar hoje pra você?"
## O que NÃO fazer
- Não despeje a lista de preços de novo sem contexto.
- Não ignore a objeção e mude de assunto.
- Não use frases de pressão tipo "só até hoje" sem essa condição existir de verdade.
$body$,
      '{"any_keywords": ["caro", "tá caro", "está caro", "muito caro", "desconto", "abaixar o preço", "mais barato", "achei mais barato", "fora do meu orçamento", "não cabe no orçamento", "valor alto", "preço alto"], "probe_keywords": ["quanto custa", "qual o valor", "quanto é", "parcelamento", "condições de pagamento", "forma de pagamento"]}'::jsonb
    )
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'objecao-preco', v_id);
  end if;
end
$seed$;

do $seed$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'agendamento'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'agendamento',
      'Playbook pra marcar/remarcar horário (consulta, visita, sessão) — oferece opções concretas de agenda real, nunca inventa disponibilidade, confirma por escrito antes de fechar.',
      $body$# Playbook: marcar horário/agendamento
## Quando usar
O lead pede pra marcar um horário, consulta, visita, demonstração ou sessão —
qualquer compromisso com data/hora. Comum em clínicas, imobiliárias (visitas),
serviços e consultorias.
## Regra de ouro: nunca invente disponibilidade
Se o agente não tiver acesso confirmado à agenda real do tenant (integração/consulta
de disponibilidade), NÃO ofereça horário específico. Diga que vai confirmar e faça
handoff, ou pergunte a preferência do lead e sinalize que a confirmação virá em
seguida. Prometer um horário que depois não existe quebra confiança e gera
reagendamento forçado.
## Fluxo padrão (if-then)
**1. Identifique o serviço/motivo antes de oferecer horário**
- SE o lead só disse "quero agendar" sem contexto → pergunte o motivo/serviço
  primeiro. Agendar sem saber o quê gera erro de encaixe (ex.: consulta de 20min
  marcada num slot de 1h de procedimento).
**2. Ofereça opções fechadas, não uma pergunta aberta**
- SE tiver acesso à agenda real → ofereça 2-3 horários concretos ("tenho terça 14h
  ou quarta 10h, qual funciona?"). Pergunta aberta tipo "qual horário você prefere?"
  gera ida e volta desnecessária e trava a conversa.
- SE não tiver acesso à agenda → não invente. Diga algo como "vou confirmar a
  disponibilidade e te retorno em instantes" e sinalize handoff/task pra quem tem
  acesso.
**3. Colete os dados obrigatórios antes de confirmar**
- Nome completo do lead (ou confirme o que já está no CRM).
- Serviço/motivo específico.
- Unidade/local, se o tenant tiver mais de uma (clínica com filiais, imobiliária com
  múltiplos imóveis).
- Se for reagendamento, o horário anterior a ser substituído.
**4. Confirme por escrito antes de encerrar**
- SE o lead aceitar um horário → repita de volta por escrito: "Confirmado:
  [serviço] dia [data] às [hora], em [local]. Confirma pra mim?"
- Só considere o agendamento fechado depois do "sim"/confirmação explícita do lead —
  silêncio ou "ok" vago não é confirmação suficiente pra compromissos com custo de
  no-show alto (ex. consulta médica, visita a imóvel).
**5. Reagendamento e cancelamento**
- SE o lead pedir pra remarcar → trate como novo agendamento: pergunte novo horário
  disponível, e cancele/substitua o anterior explicitamente (não deixe os dois
  marcados).
- SE o lead pedir pra cancelar → confirme o cancelamento e pergunte se quer remarcar
  pra outra data, sem pressionar.
**6. Risco de no-show**
- Se o negócio tiver política de confirmação D-1 documentada na base de
  conhecimento, siga-a (ex.: mensagem de lembrete automática). Se não houver, não
  invente política — apenas confirme o agendamento normalmente.
## Regras duras
- Nunca confirme horário sem ter checado disponibilidade real (ou sem sinalizar que
  ainda vai confirmar).
- Nunca marque dois compromissos conflitantes pro mesmo lead sem avisar.
- Se o lead pedir um horário fora do funcionamento do negócio (ex. domingo,
  madrugada) e isso não estiver nas regras do tenant, não confirme — explique a
  janela real de atendimento.
- Dado sensível (endereço completo, documento) só é coletado se o fluxo do tenant
  realmente exigir — não peça informação a mais que o agendamento precisa.
## Exemplos de resposta (tom, não copiar literal)
- "Pra eu te encaixar certo: é pra qual serviço/motivo?"
- "Tenho quinta às 15h ou sexta às 9h — qual fica melhor pra você?"
- "Confirmado: consulta dia 28/07 às 15h, na unidade Centro. Pode confirmar pra
  mim?"
## O que NÃO fazer
- Não pergunte "qual horário você prefere?" sem oferecer opções concretas quando
  você tem a agenda.
- Não confirme agendamento sem resposta explícita do lead.
- Não invente disponibilidade que você não checou.
$body$,
      '{"any_keywords": ["agendar", "marcar horário", "marcar consulta", "marcar uma visita", "agenda", "que horas vocês", "horário disponível", "remarcar", "reagendar", "cancelar o horário", "desmarcar"], "probe_keywords": ["que horas", "qual dia", "tem vaga", "disponibilidade"]}'::jsonb
    )
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'agendamento', v_id);
  end if;
end
$seed$;

insert into public.ai_pricing (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
select
  m.model_id,
  m.input_price_per_million_cents,
  m.output_price_per_million_cents,
  'backfill 0068 a partir de ai_models'
from public.ai_models m
where m.deprecated_at is null
  and m.input_price_per_million_cents is not null
  and m.output_price_per_million_cents is not null
  and not exists (
    select 1 from public.ai_pricing p
    where p.model = m.model_id and p.superseded_at is null
  );

insert into public.ai_pricing (model, embedding_cents_per_million_tokens, notes)
select 'openai/text-embedding-3-small', 20, 'backfill 0068 (seed original da 0010)'
where not exists (
  select 1 from public.ai_pricing p
  where p.model = 'openai/text-embedding-3-small' and p.superseded_at is null
);

alter table public.crm_leads
  add column if not exists owner_kind text
  check (owner_kind in ('user','ai'));

alter table public.crm_leads
  add column if not exists owner_agent_id uuid
  references public.ai_agents(id) on delete set null;

update public.crm_leads
   set owner_kind = 'user'
 where owner_user_id is not null
   and owner_kind is distinct from 'user';

update public.crm_leads
   set owner_kind = null
 where owner_user_id is null
   and owner_agent_id is null
   and owner_kind = 'user';

update public.crm_leads
   set owner_kind = 'ai'
 where owner_agent_id is not null
   and owner_kind is distinct from 'ai';

alter table public.crm_leads
  drop constraint if exists crm_leads_owner_kind_coherence;

alter table public.crm_leads
  add constraint crm_leads_owner_kind_coherence check (
    (owner_kind = 'user' and owner_user_id is not null and owner_agent_id is null) or
    (owner_kind = 'ai'   and owner_agent_id is not null and owner_user_id is null) or
    (owner_kind is null)
  );

create index if not exists idx_crm_leads_owner_agent
  on public.crm_leads (organization_id, owner_agent_id)
  where owner_agent_id is not null;

create or replace function public.fn_emit_event_on_lead_change() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'won' then
      perform public.fn_log_event(new.organization_id, 'lead.won',
        jsonb_build_object('lead_id', new.id, 'value_cents', new.value_cents));
    elsif new.status = 'lost' then
      perform public.fn_log_event(new.organization_id, 'lead.lost',
        jsonb_build_object('lead_id', new.id, 'lost_reason', new.lost_reason));
    elsif new.status = 'open' then
      perform public.fn_log_event(new.organization_id, 'lead.reopened',
        jsonb_build_object('lead_id', new.id));
    end if;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id
     or new.owner_agent_id is distinct from old.owner_agent_id then
    perform public.fn_log_event(new.organization_id, 'lead.assigned',
      jsonb_build_object(
        'lead_id', new.id,
        'from_user_id', old.owner_user_id, 'to_user_id', new.owner_user_id,
        'from_agent_id', old.owner_agent_id, 'to_agent_id', new.owner_agent_id,
        'owner_kind', new.owner_kind));
  end if;
  return new;
end$$;

alter table public.crm_lead_activities
  add column if not exists actor_kind text
  check (actor_kind in ('user','ai','system','rule','contact'));

alter table public.crm_lead_activities
  add column if not exists actor_agent_id uuid
  references public.ai_agents(id) on delete set null;

alter table public.crm_lead_activities
  add column if not exists reason text;

alter table public.crm_lead_activities
  add column if not exists evidence jsonb;

update public.crm_lead_activities
   set evidence = jsonb_strip_nulls(
         jsonb_build_object(
           'run_ids',   metadata->'run_ids',
           'trace_ids', metadata->'trace_ids'
         ))
 where evidence is null
   and (jsonb_typeof(metadata->'run_ids') = 'array'
     or jsonb_typeof(metadata->'trace_ids') = 'array');

update public.crm_lead_activities
   set actor_kind = metadata->>'actor_kind'
 where actor_kind is null
   and metadata->>'actor_kind' in ('user','system','rule','contact');

update public.crm_lead_activities
   set actor_kind = 'ai'
 where actor_kind is null
   and metadata->>'actor_kind' = 'ai'
   and (coalesce(jsonb_array_length(evidence->'run_ids'), 0) > 0
     or coalesce(jsonb_array_length(evidence->'trace_ids'), 0) > 0);

update public.crm_lead_activities
   set actor_kind = 'system'
 where actor_kind is null
   and metadata->>'actor_kind' = 'ai';

update public.crm_lead_activities
   set reason = metadata->>'reason'
 where reason is null
   and nullif(metadata->>'reason', '') is not null;

update public.crm_lead_activities
   set actor_kind = 'user'
 where actor_kind is null
   and performed_by_user_id is not null;

update public.crm_lead_activities
   set actor_kind = 'system'
 where actor_kind = 'ai'
   and coalesce(jsonb_array_length(evidence->'run_ids'), 0) = 0
   and coalesce(jsonb_array_length(evidence->'trace_ids'), 0) = 0;

alter table public.crm_lead_activities
  drop constraint if exists crm_lead_activities_ai_needs_evidence;

create index if not exists idx_lead_activities_org_actor_agent
  on public.crm_lead_activities (organization_id, actor_agent_id, performed_at desc)
  where actor_agent_id is not null;

alter table public.crm_leads
  add column if not exists stage_changed_at timestamptz;

update public.crm_leads
   set stage_changed_at = created_at
 where stage_changed_at is null;

alter table public.crm_leads
  alter column stage_changed_at set default now();

create or replace function public.fn_stamp_stage_changed_at() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
  elsif new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
  end if;
  return new;
end$$;

drop trigger if exists trg_stamp_stage_changed_at on public.crm_leads;

create trigger trg_stamp_stage_changed_at
  before insert or update on public.crm_leads
  for each row execute function public.fn_stamp_stage_changed_at();

alter table public.crm_lead_activities
  drop constraint if exists crm_lead_activities_ai_needs_evidence;

alter table public.crm_lead_activities
  add constraint crm_lead_activities_ai_needs_evidence check (
    actor_kind <> 'ai'
    or coalesce(jsonb_array_length(evidence->'run_ids'), 0) > 0
    or coalesce(jsonb_array_length(evidence->'trace_ids'), 0) > 0
    or coalesce(jsonb_array_length(evidence->'llm_call_ids'), 0) > 0
  );

alter table public.lead_state
  add column if not exists next_action_seq bigint not null default 0;

create table if not exists public.crm_lead_scores (
  lead_id uuid primary key references public.crm_leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_probability numeric(5, 2),
  ai_probability_reason text,
  ai_probability_evidence jsonb not null default '{}'::jsonb,
  ai_probability_at timestamptz,
  ai_probability_band text,
  ai_probability_band_since timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'crm_leads'
       and column_name = 'ai_probability'
  ) then
    execute $mig$
      insert into public.crm_lead_scores (
        lead_id, organization_id, ai_probability, ai_probability_reason,
        ai_probability_evidence, ai_probability_at, ai_probability_band,
        ai_probability_band_since
      )
      select l.id, l.organization_id, l.ai_probability, l.ai_probability_reason,
             coalesce(l.ai_probability_evidence, '{}'::jsonb), l.ai_probability_at,
             l.ai_probability_band, l.ai_probability_band_since
        from public.crm_leads l
       where l.ai_probability is not null
      on conflict (lead_id) do nothing
    $mig$;
  end if;
end $$;

alter table public.crm_leads
  drop constraint if exists crm_leads_score_needs_reason,
  drop constraint if exists crm_leads_score_range,
  drop constraint if exists crm_leads_score_band_check,
  drop constraint if exists crm_leads_score_band_coherence;

alter table public.crm_leads
  drop column if exists ai_probability,
  drop column if exists ai_probability_reason,
  drop column if exists ai_probability_evidence,
  drop column if exists ai_probability_at,
  drop column if exists ai_probability_band,
  drop column if exists ai_probability_band_since;

alter table public.crm_lead_scores
  drop constraint if exists crm_lead_scores_needs_reason;

update public.crm_lead_scores
   set ai_probability = null,
       ai_probability_reason = null,
       ai_probability_at = null,
       ai_probability_band = null,
       ai_probability_band_since = null,
       updated_at = now()
 where ai_probability is not null
   and (
     coalesce(jsonb_array_length(ai_probability_evidence -> 'factors'), 0) = 0
     or not (ai_probability_evidence @? '$.factors[*].ancora')
   );

alter table public.crm_lead_scores
  drop constraint if exists crm_lead_scores_needs_reason;

alter table public.crm_lead_scores
  add constraint crm_lead_scores_needs_reason check (
    ai_probability is null
    or (
      ai_probability_reason is not null
      and btrim(ai_probability_reason) <> ''
      and coalesce(jsonb_array_length(ai_probability_evidence -> 'factors'), 0) > 0
      and ai_probability_evidence @? '$.factors[*].ancora'
    )
  );

alter table public.crm_lead_scores
  drop constraint if exists crm_lead_scores_range;

alter table public.crm_lead_scores
  add constraint crm_lead_scores_range check (
    ai_probability is null or (ai_probability >= 0 and ai_probability <= 100)
  );

alter table public.crm_lead_scores
  drop constraint if exists crm_lead_scores_band_check;

alter table public.crm_lead_scores
  add constraint crm_lead_scores_band_check check (
    ai_probability_band is null
    or ai_probability_band = any (array['frio', 'morno', 'quente']::text[])
  );

alter table public.crm_lead_scores
  drop constraint if exists crm_lead_scores_band_coherence;

alter table public.crm_lead_scores
  add constraint crm_lead_scores_band_coherence check (
    ai_probability_band is null
    or ai_probability is null
    or (ai_probability_band = 'quente' and ai_probability >= 65)
    or (ai_probability_band = 'morno' and ai_probability >= 35 and ai_probability <= 75)
    or (ai_probability_band = 'frio' and ai_probability <= 45)
  );

alter table public.crm_lead_scores enable row level security;

drop policy if exists tenant_isolation_crm_lead_scores_all on public.crm_lead_scores;

create policy tenant_isolation_crm_lead_scores_all on public.crm_lead_scores
  for all
  using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

create index if not exists idx_crm_lead_scores_org_band
  on public.crm_lead_scores (organization_id, ai_probability_band);

create table if not exists public.crm_lead_risk_states (
  lead_id uuid primary key references public.crm_leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bucket text not null,
  since timestamptz not null,
  detected_at timestamptz not null default now(),
  cold_hours numeric not null,
  updated_at timestamptz not null default now()
);

alter table public.crm_lead_risk_states
  drop constraint if exists crm_lead_risk_states_bucket_check;

alter table public.crm_lead_risk_states
  add constraint crm_lead_risk_states_bucket_check check (
    bucket = any (array['em_dia', 'em_voo', 'em_risco', 'critico']::text[])
  );

alter table public.crm_lead_risk_states
  drop constraint if exists crm_lead_risk_states_since_no_passado;

alter table public.crm_lead_risk_states
  add constraint crm_lead_risk_states_since_no_passado check (since <= detected_at);

alter table public.crm_lead_risk_states
  drop constraint if exists crm_lead_risk_states_cold_hours_positivo;

alter table public.crm_lead_risk_states
  add constraint crm_lead_risk_states_cold_hours_positivo check (cold_hours > 0);

alter table public.crm_lead_risk_states enable row level security;

drop policy if exists tenant_isolation_crm_lead_risk_states_all on public.crm_lead_risk_states;

create policy tenant_isolation_crm_lead_risk_states_all on public.crm_lead_risk_states
  for all
  using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

create index if not exists idx_crm_lead_risk_states_org_bucket
  on public.crm_lead_risk_states (organization_id, bucket, since);

create or replace function public.fn_update_last_activity_at()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  -- LISTA POSITIVA: só isto conta como "alguém tocou este negócio". Tipo que
  -- não está aqui NÃO quebra o silêncio — inclusive tipo que ainda não existe.
  -- Ver o cabeçalho da 0079 antes de acrescentar linha nesta lista.
  if new.type not in (
    'ai_turn',              -- a IA falou com o cliente
    'note',                 -- alguém registrou trabalho no negócio
    'lead_edited',          -- humano mexeu nos dados
    'stage_changed',        -- humano moveu o negócio
    'next_action_approved'  -- humano decidiu agir
  ) then
    return new;
  end if;
  update public.crm_leads
     set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
   where id = new.lead_id;
  if new.contact_id is not null then
    update public.contacts
       set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), new.performed_at)
     where id = new.contact_id;
  end if;
  return new;
end$function$;

create or replace function public.fn_carimba_detected_at()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  new.detected_at := now();
  new.updated_at := now();
  return new;
end$function$;

drop trigger if exists trg_crm_lead_risk_states_detected_at on public.crm_lead_risk_states;

create trigger trg_crm_lead_risk_states_detected_at
  before insert or update on public.crm_lead_risk_states
  for each row
  execute function public.fn_carimba_detected_at();

create table if not exists public.crm_lead_reactivations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending',
  proposed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  draft text,
  decided_at timestamptz,
  decided_by_user_id uuid references neon_auth.user(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.crm_lead_reactivations
  drop constraint if exists crm_lead_reactivations_status_check;

alter table public.crm_lead_reactivations
  add constraint crm_lead_reactivations_status_check check (
    status = any (array['pending', 'accepted', 'dismissed', 'expired']::text[])
  );

alter table public.crm_lead_reactivations
  drop constraint if exists crm_lead_reactivations_prazo_no_futuro;

alter table public.crm_lead_reactivations
  add constraint crm_lead_reactivations_prazo_no_futuro check (expires_at > proposed_at);

alter table public.crm_lead_reactivations
  drop constraint if exists crm_lead_reactivations_decisao_datada;

alter table public.crm_lead_reactivations
  add constraint crm_lead_reactivations_decisao_datada check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  );

create unique index if not exists uq_crm_lead_reactivations_uma_viva
  on public.crm_lead_reactivations (lead_id)
  where status = 'pending';

create index if not exists idx_crm_lead_reactivations_vencendo
  on public.crm_lead_reactivations (organization_id, expires_at)
  where status = 'pending';

alter table public.crm_lead_reactivations enable row level security;

drop policy if exists tenant_isolation_crm_lead_reactivations_all on public.crm_lead_reactivations;

create policy tenant_isolation_crm_lead_reactivations_all on public.crm_lead_reactivations
  for all
  using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

create or replace function public.fn_carimba_reativacao()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    new.proposed_at := now();
  end if;
  new.updated_at := now();
  return new;
end$function$;

drop trigger if exists trg_crm_lead_reactivations_carimbo on public.crm_lead_reactivations;

create trigger trg_crm_lead_reactivations_carimbo
  before insert or update on public.crm_lead_reactivations
  for each row
  execute function public.fn_carimba_reativacao();

alter table public.crm_stages
  add column if not exists agent_stage_hint text;

alter table public.crm_stages
  drop constraint if exists crm_stages_agent_stage_hint_check;

alter table public.crm_stages
  add constraint crm_stages_agent_stage_hint_check check (
    agent_stage_hint is null
    or agent_stage_hint = any (array[
      'new', 'contacted', 'qualifying', 'qualified', 'negotiating', 'won', 'lost'
    ]::text[])
  );

alter table public.crm_stages
  drop constraint if exists crm_stages_hint_coerente_com_won_lost;

alter table public.crm_stages
  add constraint crm_stages_hint_coerente_com_won_lost check (
    (agent_stage_hint <> 'won' or is_won)
    and (agent_stage_hint <> 'lost' or is_lost)
    and (not is_won or agent_stage_hint is null or agent_stage_hint = 'won')
    and (not is_lost or agent_stage_hint is null or agent_stage_hint = 'lost')
  );

create unique index if not exists uniq_crm_stages_pipeline_hint
  on public.crm_stages (pipeline_id, agent_stage_hint)
  where agent_stage_hint is not null and is_archived = false;

update public.crm_stages
   set agent_stage_hint = 'won'
 where is_won and agent_stage_hint is null;

update public.crm_stages
   set agent_stage_hint = 'lost'
 where is_lost and agent_stage_hint is null;

analyze public.crm_leads;

create table if not exists ai_routers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(name) > 0),
  channel_session_id uuid not null references channel_sessions(id) on delete cascade,
  is_active boolean not null default true,
  config jsonb not null default jsonb_build_object(
    'classifier_model', 'claude-haiku-4-5',
    'sticky', true,
    'min_confidence', 0.6
  ),
  fallback_agent_id uuid references ai_agents(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_ai_routers_active_session
  on ai_routers (channel_session_id) where is_active;

create table if not exists ai_router_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  router_id uuid not null references ai_routers(id) on delete cascade,
  agent_id uuid not null references ai_agents(id) on delete cascade,
  intent_name text not null check (length(intent_name) > 0),
  intent_description text not null check (length(intent_description) > 0),
  examples text[] not null default '{}',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (router_id, intent_name)
);

create index if not exists idx_ai_router_members_router
  on ai_router_members (router_id, position);

create table if not exists ai_router_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  router_id uuid references ai_routers(id) on delete set null,
  conversation_id uuid,
  intent_name text,
  confidence numeric(4,3),
  agent_id uuid references ai_agents(id) on delete set null,
  outcome text not null check (outcome in ('classified', 'sticky', 'reclassified', 'fallback', 'no_match', 'classifier_failed')),
  job_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_router_decisions_org_created
  on ai_router_decisions (organization_id, created_at);

create index if not exists idx_ai_router_decisions_router
  on ai_router_decisions (router_id, created_at);

alter table conversations add column if not exists active_ai_agent_id uuid references ai_agents(id) on delete set null;

alter table conversations add column if not exists active_intent text;

alter table conversations add column if not exists active_agent_set_at timestamptz;

drop trigger if exists trg_ai_routers_audit on ai_routers;

create trigger trg_ai_routers_audit
  after insert or update or delete on ai_routers
  for each row execute function fn_audit_log_row();

drop trigger if exists trg_ai_routers_updated_at on ai_routers;

create trigger trg_ai_routers_updated_at
  before update on ai_routers
  for each row execute function fn_set_updated_at();

drop trigger if exists trg_ai_router_members_audit on ai_router_members;

create trigger trg_ai_router_members_audit
  after insert or update or delete on ai_router_members
  for each row execute function fn_audit_log_row();

drop trigger if exists trg_ai_router_members_updated_at on ai_router_members;

create trigger trg_ai_router_members_updated_at
  before update on ai_router_members
  for each row execute function fn_set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['ai_routers', 'ai_router_members', 'ai_router_decisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation_%s_all on public.%I', t, t);
    execute format(
      'create policy tenant_isolation_%s_all on public.%I for all
         using (organization_id in (select * from public.fn_user_org_ids()))
         with check (organization_id in (select * from public.fn_user_org_ids()))',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create table if not exists knowledge_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid,
  kb_version_id uuid,
  hits int not null default 0,
  top_score numeric,
  threshold numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_searches_org_created
  on knowledge_searches (organization_id, created_at desc);

alter table knowledge_searches enable row level security;

drop policy if exists tenant_isolation_knowledge_searches_all on knowledge_searches;

create policy tenant_isolation_knowledge_searches_all on knowledge_searches
  for all
  using (organization_id in (select fn_user_org_ids()))
  with check (organization_id in (select fn_user_org_ids()));

revoke all on public.knowledge_searches from anon;

create table if not exists public.system_version (
  id                  smallint primary key default 1 check (id = 1),
  current_version     text not null default '',
  current_sha         text not null default '',
  off_release         boolean not null default false,
  latest_version      text not null default '',
  changelog_raw       text not null default '',
  agent_last_seen_at  timestamptz,
  update_requested_at timestamptz,
  update_requested_by uuid references neon_auth.user(id) on delete set null,
  updated_at          timestamptz not null default now()
);

insert into public.system_version (id) values (1) on conflict (id) do nothing;

create table if not exists public.system_update_runs (
  id            uuid primary key default gen_random_uuid(),
  from_version  text not null default '',
  to_version    text not null default '',
  status        text not null default 'dispatched'
                check (status in ('dispatched','success','failed','failed_rolled_back')),
  last_step     text check (last_step in ('backup','codigo','banco')),
  requested_by  uuid references neon_auth.user(id) on delete set null,
  dispatched_at timestamptz not null default now(),
  finished_at   timestamptz,
  log_tail      text not null default ''
);

create index if not exists idx_system_update_runs_dispatched
  on public.system_update_runs (dispatched_at desc);

alter table public.system_version    enable row level security;

alter table public.system_update_runs enable row level security;

with ranked as (
  select id, row_number() over (order by dispatched_at desc) as rn
  from public.system_update_runs
  where status = 'dispatched'
)
update public.system_update_runs
set status = 'failed', finished_at = coalesce(finished_at, now())
where id in (select id from ranked where rn > 1);

create unique index if not exists uniq_system_update_runs_dispatched
  on public.system_update_runs (status)
  where status = 'dispatched';

update public.crm_stages set name = 'Em separação' where name = 'Em separacao';

update public.crm_stages set name = 'Pós-venda'    where name = 'Pos-venda';

alter table public.channel_sessions
  add column if not exists provider text not null default 'waha',
  add column if not exists meta_phone_number_id text,
  add column if not exists meta_waba_id text,
  add column if not exists meta_token_encrypted bytea;

alter table public.channel_sessions alter column waha_session_name drop not null;

alter table public.channel_sessions
  add column if not exists zernio_account_id text;

alter table public.conversations
  add column if not exists provider_conversation_id text;

create index if not exists idx_conversations_provider_conversation_id
  on public.conversations (organization_id, provider_conversation_id)
  where provider_conversation_id is not null;

alter table public.channel_sessions
  add column if not exists zernio_token_encrypted bytea;

alter table public.contacts
  add column if not exists phone_lookup_at timestamptz;

create index if not exists idx_contacts_phone_lookup_pendente
  on public.contacts (organization_id, phone_lookup_at nulls first)
  where phone_number is null;

create table if not exists public.meta_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id text not null,
  name text not null,
  language text not null,
  status text not null,                 
  category text,
  rejected_reason text,
  quality_score text,
  components jsonb not null,
  contract_hash text not null,
  parameter_format text not null default 'POSITIONAL',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.meta_templates
    add constraint meta_templates_parameter_format_check
    check (parameter_format in ('POSITIONAL', 'NAMED'));
exception when duplicate_object then null; end $$;

create unique index if not exists meta_templates_org_waba_name_lang_uniq
  on public.meta_templates (organization_id, waba_id, name, language);

create index if not exists meta_templates_org_status_idx
  on public.meta_templates (organization_id, status, name);

alter table public.meta_templates enable row level security;

drop policy if exists tenant_isolation_meta_templates_all on public.meta_templates;

create policy tenant_isolation_meta_templates_all on public.meta_templates
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

do $$ begin
  alter table public.messages drop constraint if exists messages_type_check;
  alter table public.messages add constraint messages_type_check
    check (type = any (array[
      'text', 'image', 'video', 'audio', 'document', 'sticker',
      'location', 'contact', 'reaction', 'system',
      -- novo: envio de template aprovado (canal oficial, fora da janela de 24h)
      'template'
    ]));
end $$;

alter table public.messages
  add column if not exists template_name text,
  add column if not exists template_language text;

create index if not exists messages_template_idx
  on public.messages (organization_id, template_name)
  where template_name is not null;

alter table public.system_version
  add column if not exists compare_failed boolean not null default false;

alter table public.system_version
  add column if not exists has_known_release boolean not null default true;

drop trigger if exists trg_llm_calls_budget on public.llm_calls;

create trigger trg_llm_calls_budget
  after insert on public.llm_calls
  for each row execute function public.fn_update_budget_consumption();

insert into public.ai_budgets (organization_id, current_month_consumed_cents)
select o.id,
       coalesce((select sum(cost_cents) from public.llm_calls c
                 where c.organization_id = o.id and c.created_at >= date_trunc('month', now())), 0)
     + coalesce((select sum(cost_cents) from public.ai_invocations i
                 where i.organization_id = o.id and i.created_at >= date_trunc('month', now())), 0)
from public.organizations o
on conflict (organization_id) do update
set current_month_consumed_cents = excluded.current_month_consumed_cents,
    updated_at = now();

update public.organizations o
set settings = jsonb_set(
      coalesce(o.settings, '{}'::jsonb),
      '{llm}',
      coalesce(o.settings->'llm', '{}'::jsonb)
        || jsonb_build_object(
             'provider', coalesce(o.settings->'llm'->>'provider', 'anthropic'),
             'default_model', coalesce(
               (select m.model_id from public.ai_models m
                where m.provider = coalesce(o.settings->'llm'->>'provider', 'anthropic')
                  and m.is_default_for_provider
                  and m.deprecated_at is null
                limit 1),
               'claude-sonnet-4-6'
             )
           ),
      true
    )
where coalesce(o.settings->'llm'->>'default_model', '') = '';

CREATE OR REPLACE FUNCTION "public"."fn_seed_org_llm_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(new.settings->'llm'->>'default_model', '') = '' then
    new.settings := jsonb_set(
      coalesce(new.settings, '{}'::jsonb),
      '{llm}',
      coalesce(new.settings->'llm', '{}'::jsonb)
        || jsonb_build_object(
             'provider', 'anthropic',
             'default_model', coalesce(
               (select m.model_id from public.ai_models m
                where m.provider = 'anthropic' and m.is_default_for_provider
                  and m.deprecated_at is null limit 1),
               'claude-sonnet-4-6'
             )
           ),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seed_org_llm_defaults on public.organizations;

create trigger trg_seed_org_llm_defaults
  before insert on public.organizations
  for each row execute function public.fn_seed_org_llm_defaults();

alter table public.ai_agents
  alter column config set default jsonb_build_object(
    'temperature', 0.3, 'max_tokens', 1024, 'rag_top_k', 5,
    'rag_similarity_threshold', 0.40, 'context_message_window', 20,
    'confidence_threshold', 0.55, 'sentiment_threshold', 0.3,
    'zero_data_retention', false);

update public.ai_agents
set config = jsonb_set(config, '{rag_similarity_threshold}', '0.40'::jsonb)
where (config->>'rag_similarity_threshold')::numeric = 0.72;

CREATE OR REPLACE FUNCTION "public"."retrieve_top_k_chunks"("p_organization_id" "uuid", "p_kb_version_id" "uuid", "p_embedding" "public"."vector", "p_k" integer DEFAULT 5, "p_threshold" real DEFAULT 0.40) RETURNS TABLE("chunk_id" "uuid", "knowledge_source_id" "uuid", "content" "text", "similarity" real, "metadata" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    c.id as chunk_id,
    c.knowledge_source_id,
    c.content,
    (1 - (c.embedding <=> p_embedding))::real as similarity,
    c.metadata
  from public.ai_chunks c
  where c.organization_id = p_organization_id
    and c.kb_version_id   = p_kb_version_id
    and (1 - (c.embedding <=> p_embedding)) >= p_threshold
  order by c.embedding <=> p_embedding asc
  limit greatest(p_k, 0);
$$;

alter table public.contacts
  add column if not exists locale text;

alter table public.contacts
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_updated_at   timestamptz;

do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'idx_contacts_avatar_refresh'
      and indexdef ilike '%organization_id%'
  ) then
    execute 'drop index public.idx_contacts_avatar_refresh';
  end if;
end
$$;

create index if not exists idx_contacts_avatar_refresh
  on public.contacts (avatar_updated_at nulls first)
  where wa_identity is not null and is_anonymized = false;

alter table public.crm_stages
  add column if not exists last_change_actor_kind text
  check (last_change_actor_kind in ('user','ai','system'));

alter table public.crm_stages
  add column if not exists last_change_at timestamptz;

alter table public.webhook_sources
  add column if not exists last_change_actor_kind text
  check (last_change_actor_kind in ('user','ai','system'));

alter table public.webhook_sources
  add column if not exists last_change_at timestamptz;

alter table public.automation_rules
  add column if not exists last_change_actor_kind text
  check (last_change_actor_kind in ('user','ai','system'));

alter table public.automation_rules
  add column if not exists last_change_at timestamptz;

notify pgrst, 'reload schema';

create or replace function public.fn_agent_tool_usage(
  p_organization_id uuid,
  p_agent_id        uuid,
  p_since           timestamptz
)
returns table (
  tool_name  text,
  total      bigint,
  falhas     bigint,
  em_teste   bigint,
  ultima_vez timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.metadata->>'tool_name'                                          as tool_name,
    count(*)::bigint                                                  as total,
    count(*) filter (where a.metadata->>'success' = 'false')::bigint   as falhas,
    count(*) filter (where r.is_dry_run)::bigint                       as em_teste,
    max(a.created_at)                                                 as ultima_vez
  from public.ai_agent_runs r
  join public.api_audit_log a
    on  a.request_id      = r.id::text
    and a.action          = 'mcp.tool_called'
    and a.organization_id = p_organization_id
    and a.created_at     >= p_since
  where r.organization_id = p_organization_id
    and r.agent_id        = p_agent_id
    and r.started_at     >= p_since
    and a.metadata->>'tool_name' is not null
  group by 1
$$;

grant execute on function public.fn_agent_tool_usage(uuid, uuid, timestamptz)
  to authenticated, service_role;

alter table public.cron_jobs
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancel_reason text;

create index if not exists idx_cron_jobs_retorno_vivo
  on public.cron_jobs (organization_id, contact_id, next_run_at)
  where enabled = true and job_kind = 'followup_turn';

alter table public.agent_case_events
  drop constraint if exists agent_case_events_kind_check;

alter table public.agent_case_events
  add constraint agent_case_events_kind_check check (kind in (
    'opened',
    'human_replied',
    'lead_asked',
    'lead_provided',
    'lead_unresponsive',
    'resolved',
    'escalated',
    'cancelled',
    'agent_noted'
  ));

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('anthropic', 'claude-opus-5',     'Claude Opus 5',
   'O mais capaz da Anthropic para trabalho agêntico complexo.', 500, 2500, true),
  ('anthropic', 'claude-sonnet-5',   'Claude Sonnet 5',
   'Alto desempenho para atendimento e agentes. Preço de introdução ($2/$10 por milhão) até 31/08/2026; depois volta a $3/$15 — reveja este preço nessa data.',
   200, 1000, true),
  ('anthropic', 'claude-opus-4-8',   'Claude Opus 4.8',
   'Geração anterior do Opus.', 500, 2500, true),
  ('openai',    'gpt-5.6-sol',       'GPT-5.6 Sol',
   'O mais capaz da linha 5.6.', 500, 3000, true),
  ('openai',    'gpt-5.6-terra',     'GPT-5.6 Terra',
   'Equilíbrio de custo e capacidade da linha 5.6.', 200, 1200, true),
  ('openai',    'gpt-5.6-luna',      'GPT-5.6 Luna',
   'O mais barato da linha 5.6, para classificação e tarefas simples.', 20, 120, true),
  ('openai',    'gpt-5.5',           'GPT-5.5',              null, 500, 3000, true),
  ('openai',    'gpt-5.5-pro',       'GPT-5.5 Pro',
   'Raciocínio estendido; custo alto.', 3000, 18000, true),
  ('openai',    'gpt-5.4',           'GPT-5.4',              null, 250, 1500, true),
  ('openai',    'gpt-5.4-mini',      'GPT-5.4 Mini',         null, 75, 450, true),
  ('openai',    'gpt-5.4-nano',      'GPT-5.4 Nano',         null, 20, 125, true),
  ('openai',    'gpt-5.4-pro',       'GPT-5.4 Pro',
   'Raciocínio estendido; custo alto.', 3000, 18000, true),
  ('google',    'gemini-3.1-pro-preview', 'Gemini 3.1 Pro (Preview)',
   'Prévia; preço sobe para $4/$18 por milhão acima de 200 mil tokens de entrada.', 200, 1200, true),
  ('google',    'gemini-3.5-flash',  'Gemini 3.5 Flash',     null, 150, 900, true),
  ('google',    'gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite',
   'O mais barato da linha Gemini.', 10, 40, true),
  ('google',    'gemini-2.0-flash',  'Gemini 2.0 Flash',     null, 10, 40, true)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

update public.ai_models set output_price_per_million_cents = 1000
 where provider = 'google' and model_id = 'gemini-2.5-pro';

update public.ai_models set output_price_per_million_cents = 250
 where provider = 'google' and model_id = 'gemini-2.5-flash';

update public.ai_models set is_default_for_provider = false
 where provider in ('anthropic', 'openai', 'google') and is_default_for_provider;

update public.ai_models set is_default_for_provider = true
 where (provider = 'anthropic' and model_id = 'claude-sonnet-5')
    or (provider = 'openai'    and model_id = 'gpt-5.6-terra')
    or (provider = 'google'    and model_id = 'gemini-3.5-flash');

insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('claude-opus-5',          500,   2500,  'catálogo 0101'),
  ('claude-sonnet-5',        200,   1000,  'catálogo 0101 — introdução até 31/08/2026; depois 300/1500'),
  ('claude-opus-4-8',        500,   2500,  'catálogo 0101'),
  ('gpt-5.6-sol',            500,   3000,  'catálogo 0101'),
  ('gpt-5.6-terra',          200,   1200,  'catálogo 0101'),
  ('gpt-5.6-luna',            20,    120,  'catálogo 0101'),
  ('gpt-5.5',                500,   3000,  'catálogo 0101'),
  ('gpt-5.5-pro',           3000,  18000,  'catálogo 0101'),
  ('gpt-5.4',                250,   1500,  'catálogo 0101'),
  ('gpt-5.4-mini',            75,    450,  'catálogo 0101'),
  ('gpt-5.4-nano',            20,    125,  'catálogo 0101'),
  ('gpt-5.4-pro',           3000,  18000,  'catálogo 0101'),
  ('gemini-3.1-pro-preview', 200,   1200,  'catálogo 0101 — sobe acima de 200k tokens de entrada'),
  ('gemini-3.5-flash',       150,    900,  'catálogo 0101'),
  ('gemini-2.5-flash-lite',   10,     40,  'catálogo 0101'),
  ('gemini-2.0-flash',        10,     40,  'catálogo 0101'),
  ('gemini-2.5-pro',         125,   1000,  'catálogo 0101 — saída corrigida de 500 para 1000'),
  ('gemini-2.5-flash',        30,    250,  'catálogo 0101 — saída corrigida de 120 para 250')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'qr_rescan',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'other'
  ));

notify pgrst, 'reload schema';

alter table public.channel_sessions
  add column if not exists archived_at timestamptz;

create index if not exists channel_sessions_org_active_idx
  on public.channel_sessions (organization_id, created_at)
  where archived_at is null;

notify pgrst, 'reload schema';

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.channel_sessions'::regclass
       and conname = 'channel_sessions_phone_per_org_unique'
  ) then
    alter table public.channel_sessions
      drop constraint channel_sessions_phone_per_org_unique;
  end if;
end $$;

create unique index if not exists channel_sessions_phone_per_org_unique
  on public.channel_sessions (organization_id, phone_number)
  where archived_at is null;

revoke execute on function public.fn_is_platform_admin() from public, anon;

revoke execute on function public.fn_user_org_ids() from public, anon;

revoke execute on function public.fn_user_role_in_org(uuid) from public, anon;

revoke execute on function public.fn_user_role_in(uuid) from public, anon;

revoke execute on function public.fn_role_at_least(uuid, text) from public, anon;

revoke execute on function public.fn_publish_ai_agent_version(uuid, uuid, uuid) from public, anon;

revoke execute on function public.fn_emit_conversation_routing() from public, anon;

revoke execute on function public.rls_auto_enable() from public, anon;

revoke execute on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) from authenticated;

revoke execute on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) from authenticated;

revoke execute on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) from authenticated;

revoke execute on function public.fn_publish_ai_agent_version(uuid, uuid, uuid) from authenticated;

revoke execute on function public.activate_kb_version(uuid, uuid) from authenticated;

revoke execute on function public.fn_emit_conversation_routing() from authenticated;

revoke execute on function public.rls_auto_enable() from authenticated;

grant execute on function public.fn_upsert_wa_contact(uuid, text, text, text, text, text) to service_role;

grant execute on function public.fn_upsert_wa_conversation(uuid, uuid, uuid) to service_role;

grant execute on function public.fn_mark_conversation_message(uuid, text, text, timestamptz) to service_role;

grant execute on function public.fn_publish_ai_agent_version(uuid, uuid, uuid) to service_role;

grant execute on function public.activate_kb_version(uuid, uuid) to service_role;

grant execute on function public.fn_emit_conversation_routing() to service_role;

grant execute on function public.rls_auto_enable() to service_role;

grant execute on function public.fn_is_platform_admin() to authenticated, service_role;

grant execute on function public.fn_user_org_ids() to authenticated, service_role;

grant execute on function public.fn_user_role_in_org(uuid) to authenticated, service_role;

grant execute on function public.fn_user_role_in(uuid) to authenticated, service_role;

grant execute on function public.fn_role_at_least(uuid, text) to authenticated, service_role;

alter table public.ai_invocations
  alter column agent_id drop not null;

create index if not exists idx_conversations_org_silencio
  on public.conversations (organization_id, last_outbound_at)
  where last_outbound_at is not null;

create or replace function public.fn_atrito_jaccard(a text, b text)
returns float8
language sql
immutable
set search_path = public
as $$
  with
  ta as (
    select distinct token from unnest(
      string_to_array(lower(regexp_replace(coalesce(a, ''), '[^[:alnum:][:space:]]', ' ', 'g')), ' ')
    ) as token
    where length(token) >= 3
  ),
  tb as (
    select distinct token from unnest(
      string_to_array(lower(regexp_replace(coalesce(b, ''), '[^[:alnum:][:space:]]', ' ', 'g')), ' ')
    ) as token
    where length(token) >= 3
  )
  select case
    when (select count(*) from ta) = 0 or (select count(*) from tb) = 0 then 0::float8
    else (select count(*) from (select token from ta intersect select token from tb) i)::float8
       / nullif((select count(*) from (select token from ta union select token from tb) u), 0)::float8
  end;
$$;

revoke all     on function public.fn_atrito_jaccard(text, text) from public;

revoke execute on function public.fn_atrito_jaccard(text, text) from anon;

grant  execute on function public.fn_atrito_jaccard(text, text) to authenticated, service_role;

create table if not exists public.demandas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  agent_case_id uuid references public.agent_cases(id) on delete set null,
  aberta_em timestamptz not null default now(),
  origem text not null default 'inbound'
    check (origem in ('inbound', 'handoff', 'followup', 'manual', 'derivada')),
  assunto text,
  estado text not null default 'aberta'
    check (estado in ('aberta', 'em_atendimento', 'aguardando_cliente', 'resolvida', 'encerrada')),
  dono_kind text not null default 'ia' check (dono_kind in ('ia', 'humano')),
  dono_user_id uuid references neon_auth.user(id) on delete set null,
  proximo_passo text,
  proximo_passo_em timestamptz,
  prazo_em timestamptz,
  desfecho text check (desfecho in (
    'resolvida', 'convertida', 'nao_procede',
    'encerrada_pelo_cliente', 'perdida', 'expirada_sem_resposta'
  )),
  fechada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demandas_desfecho_coerente
    check ((desfecho is null) = (fechada_em is null)),
  constraint demandas_dono_humano_tem_user
    check (dono_kind <> 'humano' or dono_user_id is not null)
);

create table if not exists public.demanda_conversas (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  demanda_id uuid not null references public.demandas(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  vinculada_em timestamptz not null default now(),
  primary key (demanda_id, conversation_id)
);

create index if not exists idx_demandas_org_abertas
  on public.demandas (organization_id, aberta_em)
  where fechada_em is null;

create index if not exists idx_demandas_org_fechadas
  on public.demandas (organization_id, fechada_em)
  where fechada_em is not null;

create index if not exists idx_demandas_caso
  on public.demandas (organization_id, agent_case_id)
  where agent_case_id is not null;

create index if not exists idx_demandas_contato
  on public.demandas (organization_id, contact_id);

create index if not exists idx_demandas_sem_proximo_passo
  on public.demandas (organization_id, aberta_em)
  where fechada_em is null and proximo_passo is null;

create index if not exists idx_demanda_conversas_conv
  on public.demanda_conversas (organization_id, conversation_id);

alter table public.demandas enable row level security;

alter table public.demanda_conversas enable row level security;

drop policy if exists tenant_isolation_demandas_all on public.demandas;

create policy tenant_isolation_demandas_all on public.demandas
  for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

drop policy if exists tenant_isolation_demanda_conversas_all on public.demanda_conversas;

create policy tenant_isolation_demanda_conversas_all on public.demanda_conversas
  for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

insert into public.demandas
  (organization_id, contact_id, lead_id, agent_case_id, aberta_em, origem, assunto,
   estado, dono_kind, desfecho, fechada_em)
select
  c.organization_id,
  cv.contact_id,
  c.lead_id,
  c.id,
  c.opened_at,
  'handoff',
  c.title,
  case c.status
    when 'awaiting_human' then 'em_atendimento'
    when 'awaiting_lead'  then 'aguardando_cliente'
    when 'resolved'       then 'resolvida'
    when 'escalated'      then 'em_atendimento'
    when 'cancelled'      then 'encerrada'
    else 'aberta'
  end,
  'ia',
  case c.status
    when 'resolved'  then 'resolvida'
    when 'cancelled' then 'nao_procede'
    else null
  end,
  case when c.status in ('resolved', 'cancelled') then c.closed_at else null end
  from public.agent_cases c
  join public.conversations cv on cv.id = c.conversation_id
 where not exists (
   select 1 from public.demandas d
    where d.organization_id = c.organization_id
      and d.contact_id = cv.contact_id
      and d.origem = 'handoff'
      and d.aberta_em = c.opened_at
 );

insert into public.demanda_conversas (organization_id, demanda_id, conversation_id)
select d.organization_id, d.id, c.conversation_id
  from public.demandas d
  join public.agent_cases c on c.id = d.agent_case_id
 where d.agent_case_id is not null
   and not exists (
     select 1 from public.demanda_conversas dc
      where dc.demanda_id = d.id and dc.conversation_id = c.conversation_id
   );

insert into public.demandas
  (organization_id, contact_id, aberta_em, origem, estado, dono_kind, desfecho, fechada_em)
select
  cv.organization_id,
  cv.contact_id,
  cv.created_at,
  'derivada',
  case cv.status when 'resolved' then 'resolvida' when 'closed' then 'encerrada' else 'aberta' end,
  'ia',
  case when cv.status in ('resolved', 'closed') then 'resolvida' else null end,
  case when cv.status in ('resolved', 'closed') then cv.status_changed_at else null end
  from public.conversations cv
 where not exists (
   select 1 from public.agent_cases c where c.conversation_id = cv.id
 )
   and not exists (
   select 1 from public.demandas d
    where d.organization_id = cv.organization_id
      and d.contact_id = cv.contact_id
      and d.origem = 'derivada'
      and d.aberta_em = cv.created_at
 );

insert into public.demanda_conversas (organization_id, demanda_id, conversation_id)
select d.organization_id, d.id, cv.id
  from public.demandas d
  join public.conversations cv
    on cv.organization_id = d.organization_id
   and cv.contact_id = d.contact_id
   and cv.created_at = d.aberta_em
 where d.origem = 'derivada'
   and not exists (
     select 1 from public.demanda_conversas dc
      where dc.demanda_id = d.id and dc.conversation_id = cv.id
   );

drop function if exists public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int);

create or replace function public.fn_atrito_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_abandono_horas int default 72,
  p_repeticao_min float8 default 0.7,
  p_espera_horas int default 4
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  -- DENOMINADOR DEFINITIVO: demandas encerradas na janela. Não mais os casos.
  demandas_j as (
    select d.id, d.agent_case_id, d.aberta_em, d.fechada_em, d.desfecho
      from public.demandas d
     where d.organization_id = p_org
       and d.fechada_em is not null
       and d.fechada_em >= p_from
       and d.fechada_em <  p_to
  ),
  -- Turnos: mensagens de TODAS as conversas da demanda (N:N), dentro da vida
  -- dela. Uma demanda que atravessou dois canais soma os dois.
  turnos as (
    select d.id,
           (select count(*)
              from public.demanda_conversas dc
              join public.messages m
                on m.conversation_id = dc.conversation_id
               and m.organization_id = p_org
               and m.sent_at >= d.aberta_em
               and m.sent_at <  d.fechada_em
             where dc.demanda_id = d.id) as n
      from demandas_j d
  ),
  -- Insistência: só existe onde houve caso. O payload declara o denominador
  -- próprio (`demandas_com_caso`) para o número não ser lido como se fosse
  -- sobre o total.
  insistencia as (
    select avg(c.followup_attempts)::float8 as media,
           max(c.followup_attempts)         as maximo,
           count(*)                         as base
      from demandas_j d
      join public.agent_cases c on c.id = d.agent_case_id
  ),
  humano as (
    select e.case_id, count(*) as intervencoes, min(e.created_at) as primeiro_toque
      from public.agent_case_events e
      join demandas_j d on d.agent_case_id = e.case_id
     where e.organization_id = p_org and e.actor_kind = 'human'
     group by e.case_id
  ),
  espera_fila as (
    select extract(epoch from (h.primeiro_toque - d.aberta_em)) as segundos
      from demandas_j d join humano h on h.case_id = d.agent_case_id
     where h.primeiro_toque > d.aberta_em
  ),
  retrabalho as (
    select count(distinct e.case_id) as n
      from public.agent_case_events e
      join demandas_j d on d.agent_case_id = e.case_id
     where e.organization_id = p_org
       and (e.kind = 'escalated' or e.human_action = 'escalate')
  ),
  abandono as (
    select
      count(*) filter (
        where cv.last_outbound_at >= p_from and cv.last_outbound_at < p_to
          and (cv.last_inbound_at is null or cv.last_outbound_at > cv.last_inbound_at)
          and cv.last_outbound_at < now() - make_interval(hours => p_abandono_horas)
          and cv.status not in ('resolved', 'closed')
      ) as abandonadas,
      count(*) filter (
        where cv.last_outbound_at >= p_from and cv.last_outbound_at < p_to
      ) as com_fala_nossa
      from public.conversations cv
     where cv.organization_id = p_org and cv.last_outbound_at is not null
  ),
  -- INVARIANTE 4, agora VERIFICÁVEL: demanda aberta sem próximo passo é o
  -- vazamento que a doutrina proíbe. Antes da 0119 isto não era enumerável.
  sem_proximo_passo as (
    select count(*) as n
      from public.demandas d
     where d.organization_id = p_org
       and d.fechada_em is null
       and d.proximo_passo is null
  ),
  demandas_abertas as (
    select count(*) as n from public.demandas d
     where d.organization_id = p_org and d.fechada_em is null
  ),
  inbounds as (
    select m.conversation_id, m.sent_at, m.body,
           lag(m.body)    over (partition by m.conversation_id order by m.sent_at) as body_anterior,
           lag(m.sent_at) over (partition by m.conversation_id order by m.sent_at) as sent_at_anterior
      from public.messages m
     where m.organization_id = p_org and m.direction = 'inbound' and m.body is not null
       and m.sent_at >= p_from and m.sent_at < p_to
  ),
  repeticao as (
    select
      count(*) filter (
        where i.body_anterior is not null
          and exists (select 1 from public.messages o
                       where o.organization_id = p_org and o.conversation_id = i.conversation_id
                         and o.direction = 'outbound'
                         and o.sent_at > i.sent_at_anterior and o.sent_at < i.sent_at)
          and public.fn_atrito_jaccard(i.body, i.body_anterior) >= p_repeticao_min
      ) as repetidas,
      count(*) filter (
        where i.body_anterior is not null
          and exists (select 1 from public.messages o
                       where o.organization_id = p_org and o.conversation_id = i.conversation_id
                         and o.direction = 'outbound'
                         and o.sent_at > i.sent_at_anterior and o.sent_at < i.sent_at)
      ) as com_resposta_no_meio
      from inbounds i
  ),
  espera_calada as (
    select count(*) filter (where prox.espera_s > p_espera_horas * 3600) as caladas,
           count(*) as com_resposta,
           percentile_cont(0.9) within group (order by prox.espera_s) as p90_s
      from (
        select extract(epoch from (
                 (select min(o.sent_at) from public.messages o
                   where o.organization_id = p_org and o.conversation_id = m.conversation_id
                     and o.direction = 'outbound' and o.sent_at > m.sent_at) - m.sent_at)) as espera_s
          from public.messages m
         where m.organization_id = p_org and m.direction = 'inbound'
           and m.sent_at >= p_from and m.sent_at < p_to
      ) prox
     where prox.espera_s is not null
  ),
  envios as (
    select count(*) filter (where m.sent_via = 'ai')              as por_ia,
           count(*) filter (where m.sent_via = 'user')            as por_humano_no_sistema,
           count(*) filter (where m.sent_via = 'external_device') as por_humano_fora
      from public.messages m
     where m.organization_id = p_org and m.direction = 'outbound'
       and m.sent_at >= p_from and m.sent_at < p_to
  ),
  vetos as (
    select count(*) filter (where t.vetoed_gate is not null) as vetados,
           count(distinct t.job_id) as execucoes
      from public.before_send_traces t
     where t.organization_id = p_org and t.created_at >= p_from and t.created_at < p_to
  ),
  descadastros as (
    select count(*) as n from public.contacts c
     where c.organization_id = p_org and c.blocked_at is not null
       and c.blocked_at >= p_from and c.blocked_at < p_to
  ),
  pedidos_humano as (
    select count(*) as n from public.crm_lead_activities a
     where a.organization_id = p_org and a.type = 'handoff_triggered'
       and a.performed_at >= p_from and a.performed_at < p_to
  ),
  eficiencia as (
    select count(*) filter (where status = 'won')  as ganhos,
           count(*) filter (where status = 'lost') as perdidos
      from public.crm_leads
     where organization_id = p_org and status in ('won', 'lost')
       and closed_at >= p_from and closed_at < p_to
  )
  select jsonb_build_object(
    'escopo', jsonb_build_object(
      'demandas',            (select count(*) from demandas_j),
      'demandas_com_caso',   (select base from insistencia),
      'demandas_abertas',    (select n from demandas_abertas),
      'de', p_from, 'ate', p_to,
      'abandono_horas', p_abandono_horas,
      'repeticao_min',  p_repeticao_min,
      'espera_horas',   p_espera_horas,
      -- Marca a régua do denominador: quem comparar dois períodos precisa saber
      -- se foram medidos sobre casos ou sobre demandas.
      'denominador', 'demandas'
    ),
    'cliente', jsonb_build_object(
      'turnos_p50',        (select percentile_cont(0.5) within group (order by n) from turnos),
      'turnos_p90',        (select percentile_cont(0.9) within group (order by n) from turnos),
      'insistencia_media', (select media  from insistencia),
      'insistencia_max',   (select maximo from insistencia),
      'pedidos_de_humano', (select n from pedidos_humano),
      'descadastros',      (select n from descadastros),
      'abandonos',         (select abandonadas   from abandono),
      'conversas_com_fala_nossa', (select com_fala_nossa from abandono),
      'reperguntas',              (select repetidas            from repeticao),
      'perguntas_com_resposta',   (select com_resposta_no_meio from repeticao),
      'esperas_caladas',          (select caladas      from espera_calada),
      'esperas_medidas',          (select com_resposta from espera_calada),
      'espera_resposta_p90_s',    (select p90_s        from espera_calada)
    ),
    'empresa', jsonb_build_object(
      'intervencoes_por_demanda', (select avg(coalesce(h.intervencoes, 0))::float8
                                     from demandas_j d left join humano h on h.case_id = d.agent_case_id),
      'espera_humana_p50_s',      (select percentile_cont(0.5) within group (order by segundos) from espera_fila),
      'espera_humana_p90_s',      (select percentile_cont(0.9) within group (order by segundos) from espera_fila),
      'retrabalho',               (select n from retrabalho),
      'vetos',                    (select vetados  from vetos),
      'execucoes_medidas',        (select execucoes from vetos),
      'envios_por_ia',            (select por_ia                from envios),
      'envios_humano_no_sistema', (select por_humano_no_sistema from envios),
      'envios_humano_fora',       (select por_humano_fora       from envios),
      -- O invariante 4 vira NÚMERO na tela: demanda aberta sem próximo passo é
      -- vazamento, e vazamento invisível é o que a doutrina inteira combate.
      'demandas_sem_proximo_passo', (select n from sem_proximo_passo)
    ),
    'eficiencia', jsonb_build_object(
      'ganhos',   (select ganhos   from eficiencia),
      'perdidos', (select perdidos from eficiencia)
    )
  );
$$;

revoke all     on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int) from public;

revoke execute on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int) from anon;

grant  execute on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int)
  to authenticated, service_role;

create or replace function public.fn_demanda_abre_no_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demanda uuid;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;
  select d.id into v_demanda
    from public.demandas d
   where d.organization_id = new.organization_id
     and d.contact_id = new.contact_id
     and d.fechada_em is null
   order by d.aberta_em desc
   limit 1;
  if v_demanda is null then
    insert into public.demandas
      (organization_id, contact_id, aberta_em, origem, estado, dono_kind)
    values
      (new.organization_id, new.contact_id, new.sent_at, 'inbound', 'aberta', 'ia')
    returning id into v_demanda;
  end if;
  -- O vínculo é por conversa: a mesma demanda acumula os canais por onde a
  -- pessoa falou (cap. 5 §5.4). `on conflict do nothing` porque a chave é o par.
  insert into public.demanda_conversas (organization_id, demanda_id, conversation_id)
  values (new.organization_id, v_demanda, new.conversation_id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all     on function public.fn_demanda_abre_no_inbound() from public;

revoke execute on function public.fn_demanda_abre_no_inbound() from anon, authenticated;

drop trigger if exists trg_demanda_abre_no_inbound on public.messages;

create trigger trg_demanda_abre_no_inbound
  after insert on public.messages
  for each row execute function public.fn_demanda_abre_no_inbound();

create or replace function public.fn_demanda_fecha_com_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('resolved', 'closed') or old.status = new.status then
    return new;
  end if;
  update public.demandas d
     set estado = 'resolvida',
         desfecho = 'resolvida',
         fechada_em = now(),
         updated_at = now()
   where d.organization_id = new.organization_id
     and d.fechada_em is null
     and exists (
       select 1 from public.demanda_conversas dc
        where dc.demanda_id = d.id and dc.conversation_id = new.id
     )
     -- Só fecha se TODAS as conversas da demanda estiverem encerradas: uma
     -- demanda que atravessou dois canais não acabou porque um deles fechou.
     and not exists (
       select 1
         from public.demanda_conversas dc2
         join public.conversations c2 on c2.id = dc2.conversation_id
        where dc2.demanda_id = d.id
          and c2.id <> new.id
          and c2.status not in ('resolved', 'closed')
     );
  return new;
end;
$$;

revoke all     on function public.fn_demanda_fecha_com_conversa() from public;

revoke execute on function public.fn_demanda_fecha_com_conversa() from anon, authenticated;

drop trigger if exists trg_demanda_fecha_com_conversa on public.conversations;

create trigger trg_demanda_fecha_com_conversa
  after update of status on public.conversations
  for each row execute function public.fn_demanda_fecha_com_conversa();

notify pgrst, 'reload schema';

alter table lead_checkpoints
  add column if not exists declaracao jsonb;

notify pgrst, 'reload schema';

alter table ai_agent_versions
  add column if not exists operator_enabled boolean not null default false;

alter table ai_agent_versions
  add column if not exists operator_model text;

alter table ai_agent_versions
  add column if not exists operator_tool_ids text[] not null default '{}'::text[];

notify pgrst, 'reload schema';

create or replace function public.fn_audit_log_row() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_action text;
  v_org    uuid;
begin
  if tg_op = 'INSERT' then
    v_action := tg_table_name || '.created';
    v_org    := new.organization_id;
  elsif tg_op = 'UPDATE' then
    v_action := tg_table_name || '.updated';
    v_org    := new.organization_id;
  elsif tg_op = 'DELETE' then
    v_action := tg_table_name || '.deleted';
    v_org    := old.organization_id;
    -- A organização está indo embora (cascade em curso). Registrar a exclusão
    -- de um filho num tenant que deixa de existir não tem consumidor: a linha
    -- seria apagada pelo cascade em seguida — e tentar escrevê-la aborta a
    -- transação inteira, que era o defeito.
    --
    -- SÓ no ramo DELETE: um `exists` no INSERT/UPDATE cobraria um SELECT em
    -- todo hot path de escrita para cobrir um caso que não ocorre lá.
    if v_org is not null and not exists (select 1 from public.organizations where id = v_org) then
      return old;
    end if;
  end if;
  insert into public.api_audit_log (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
  values (
    v_org,
    auth.uid(),
    v_action,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE'
      then jsonb_build_object('changed_fields', '[diff suppressed in v0.1]')
      else '{}'::jsonb
    end
  );
  return coalesce(new, old);
end $$;

create or replace function public.fn_liberar_leads_do_agente() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
begin
  -- ANTES de a FK aplicar seu SET NULL. Zera os DOIS campos: deixar
  -- `owner_kind = 'ai'` com o agente nulo é exatamente o estado que
  -- `crm_leads_owner_kind_coherence` proíbe.
  update public.crm_leads
     set owner_agent_id = null,
         owner_kind     = null
   where owner_agent_id = old.id;
  return old;
end $$;

revoke execute on function public.fn_liberar_leads_do_agente() from public, anon, authenticated;

grant  execute on function public.fn_liberar_leads_do_agente() to service_role;

drop trigger if exists trg_liberar_leads_do_agente on public.ai_agents;

create trigger trg_liberar_leads_do_agente
  before delete on public.ai_agents
  for each row execute function public.fn_liberar_leads_do_agente();

create table if not exists public.ai_purpose_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose text not null,
  provider text not null,
  credential_id uuid references public.ai_provider_credentials(id) on delete cascade,
  model_id text not null,
  base_url text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

delete from public.ai_purpose_bindings a
 using public.ai_purpose_bindings b
 where a.organization_id = b.organization_id
   and a.purpose = b.purpose
   and (a.updated_at, a.id) < (b.updated_at, b.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ai_purpose_bindings_org_purpose_unique'
       and conrelid = 'public.ai_purpose_bindings'::regclass
  ) then
    alter table public.ai_purpose_bindings
      add constraint ai_purpose_bindings_org_purpose_unique unique (organization_id, purpose);
  end if;
end $$;

create index if not exists ai_purpose_bindings_org_idx
  on public.ai_purpose_bindings (organization_id);

create index if not exists ai_purpose_bindings_lookup_idx
  on public.ai_purpose_bindings (organization_id, purpose) where is_enabled;

create index if not exists ai_purpose_bindings_credential_idx
  on public.ai_purpose_bindings (credential_id) where credential_id is not null;

alter table public.ai_purpose_bindings
  drop constraint if exists ai_purpose_bindings_credential_id_fkey;

alter table public.ai_purpose_bindings
  add constraint ai_purpose_bindings_credential_id_fkey
  foreign key (credential_id) references public.ai_provider_credentials(id)
  on delete set null;

alter table public.ai_purpose_bindings enable row level security;

drop policy if exists tenant_isolation_ai_purpose_bindings_all on public.ai_purpose_bindings;

create policy tenant_isolation_ai_purpose_bindings_all on public.ai_purpose_bindings
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop trigger if exists ai_purpose_bindings_updated_at on public.ai_purpose_bindings;

create trigger ai_purpose_bindings_updated_at
  before update on public.ai_purpose_bindings
  for each row execute function public.fn_set_updated_at();

alter table public.ai_agent_versions       drop constraint if exists ai_agent_versions_provider_check;

alter table public.ai_models               drop constraint if exists ai_models_provider_check;

alter table public.ai_provider_credentials drop constraint if exists ai_provider_credentials_provider_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_models_provider_nao_vazio') then
    alter table public.ai_models add constraint ai_models_provider_nao_vazio check (length(btrim(provider)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_provider_credentials_provider_nao_vazio') then
    alter table public.ai_provider_credentials add constraint ai_provider_credentials_provider_nao_vazio check (length(btrim(provider)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_agent_versions_provider_nao_vazio') then
    alter table public.ai_agent_versions add constraint ai_agent_versions_provider_nao_vazio check (length(btrim(provider)) > 0);
  end if;
end $$;

alter table public.ai_models add column if not exists source text not null default 'manual';

alter table public.ai_models add column if not exists synced_at timestamptz;

alter table public.ai_models add column if not exists supports_vision boolean not null default false;

delete from public.ai_models a
 using public.ai_models b
 where a.provider = b.provider
   and a.model_id = b.model_id
   and (
     (a.input_price_per_million_cents is null and b.input_price_per_million_cents is not null)
     or (
       (a.input_price_per_million_cents is null) = (b.input_price_per_million_cents is null)
       and a.id < b.id
     )
   );

create unique index if not exists ai_models_provider_model_unique on public.ai_models (provider, model_id);

create index if not exists ai_models_source_idx on public.ai_models (source) where deprecated_at is null;

alter table public.llm_calls add column if not exists status text not null default 'ok';

alter table public.llm_calls add column if not exists error_code text;

alter table public.llm_calls add column if not exists error_message text;

alter table public.llm_calls add column if not exists http_status int;

alter table public.llm_calls add column if not exists origem_da_escolha text;

update public.llm_calls set status = 'ok' where status is null or status not in ('ok', 'erro');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'llm_calls_status_check') then
    alter table public.llm_calls add constraint llm_calls_status_check check (status in ('ok', 'erro'));
  end if;
end $$;

create index if not exists llm_calls_erros_idx
  on public.llm_calls (organization_id, created_at desc) where status = 'erro';

create index if not exists llm_calls_purpose_idx
  on public.llm_calls (organization_id, purpose, created_at desc);

alter table public.llm_calls add column if not exists agent_id uuid
  references public.ai_agents(id) on delete set null;

create index if not exists llm_calls_agent_idx
  on public.llm_calls (organization_id, agent_id, created_at desc) where agent_id is not null;

alter table public.llm_calls add column if not exists legacy_invocation_id uuid;

create unique index if not exists llm_calls_legacy_invocation_unique
  on public.llm_calls (legacy_invocation_id) where legacy_invocation_id is not null;

insert into public.llm_calls (
  organization_id, agent_id, contact_id, job_id, purpose, provider, model,
  input_tokens, output_tokens, cost_cents, latency_ms, created_at,
  status, error_code, legacy_invocation_id
)
select
  i.organization_id,
  i.agent_id,
  null,                       
  null,
  i.invocation_kind,
  case
    when i.model like 'anthropic/%' then 'anthropic'
    when i.model like 'openai/%'    then 'openai'
    when i.model like 'google/%'    then 'google'
    when i.model like 'claude%'     then 'anthropic'
    when i.model like 'gpt%'        then 'openai'
    when i.model like 'gemini%'     then 'google'
    else 'desconhecido'
  end,
  i.model,
  i.prompt_tokens,
  i.completion_tokens,
  i.cost_cents,
  i.latency_ms,
  i.created_at,
  case when i.error_payload is not null then 'erro' else 'ok' end,
  case when i.error_payload is not null then 'erro_legado' else null end,
  i.id
from public.ai_invocations i
where not exists (
  select 1 from public.llm_calls c where c.legacy_invocation_id = i.id
)
on conflict do nothing;

insert into public.ai_budgets (organization_id, current_month_consumed_cents)
select o.id,
       coalesce((select sum(c.cost_cents) from public.llm_calls c
                 where c.organization_id = o.id
                   and c.created_at >= date_trunc('month', now())), 0)
     + coalesce((select sum(i.cost_cents) from public.ai_invocations i
                 where i.organization_id = o.id
                   and i.created_at >= date_trunc('month', now())
                   and not exists (
                     select 1 from public.llm_calls c2 where c2.legacy_invocation_id = i.id
                   )), 0)
from public.organizations o
on conflict (organization_id) do update
set current_month_consumed_cents = excluded.current_month_consumed_cents,
    updated_at = now();

alter table public.contacts
  add column if not exists wa_lid text
  generated always as (
    nullif(regexp_replace(coalesce(source_metadata->>'waha_lid', ''), '@.*$', ''), '')
  ) stored;

with ranked as (
  select id,
         first_value(id) over (
           partition by organization_id,
             nullif(regexp_replace(coalesce(source_metadata->>'waha_lid', ''), '@.*$', ''), '')
           order by created_at asc, id asc
         ) as canonical_id
    from public.contacts
   where is_merged_into is null
     and nullif(regexp_replace(coalesce(source_metadata->>'waha_lid', ''), '@.*$', ''), '') is not null
)
update public.contacts c
   set is_merged_into = r.canonical_id, merged_at = now()
  from ranked r
 where c.id = r.id and r.id <> r.canonical_id;

update public.conversations       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.messages            t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.ai_agent_runs       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.crm_lead_activities t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.crm_leads           t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.lgpd_requests       t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

update public.orders              t set contact_id = c.is_merged_into from public.contacts c where t.contact_id = c.id and c.is_merged_into is not null;

create unique index if not exists uniq_contacts_org_wa_lid
  on public.contacts (organization_id, wa_lid)
  where wa_lid is not null and is_merged_into is null;

create or replace function public.fn_upsert_wa_contact(
  p_org uuid, p_kind text, p_phone text, p_lid text, p_chat_id text, p_notify text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_conflito text;
  v_lid text := nullif(regexp_replace(coalesce(p_lid, ''), '@.*$', ''), '');
  v_phone text := nullif(p_phone, '');
begin
  -- ⚠️ A ASSINATURA NÃO MUDA, e não é economia de digitação.
  --
  -- A primeira versão desta migration acrescentava um 7º parâmetro
  -- (`p_phone_alt`) para o telefone vindo de `_data.key.remoteJidAlt`. Isso
  -- criava uma função nova aos olhos do Postgres, obrigava a dropar a de 6 e
  -- forçava a edição de DOIS invariantes de hardening que citam a assinatura —
  -- que o hook do repo (com razão) congela.
  --
  -- Quem sabe QUAL telefone usar é o chamador: `lib/waha/ingest.ts` já resolve o
  -- chatId e agora também lê o `remoteJidAlt`. Ele manda um telefone só, em
  -- `p_phone`. Menos superfície, mesma capacidade, e os grants existentes
  -- continuam valendo — a catraca levou ao desenho menor.
  -- 1 · pela correlação do WhatsApp, que NÃO depende do telefone.
  --     `wa_identity` é gerada com o telefone na frente do lid: um contato @lid
  --     que ganha número passa a valer `phone:+Y` e o `on conflict` antigo
  --     deixava de reencontrá-lo — nascia um contato por mensagem.
  if v_lid is not null then
    select id into v_id from public.contacts
     where organization_id = p_org and wa_lid = v_lid and is_merged_into is null
     limit 1;
  end if;
  -- 2 · pelo telefone — é aqui que a pessoa que já existia por número (import,
  --     formulário, pedido) deixa de virar um segundo contato ao escrever no
  --     WhatsApp. Sem este passo, descobrir o telefone criaria o gêmeo em vez de
  --     evitá-lo.
  if v_id is null and v_phone is not null then
    select id into v_id from public.contacts
     where organization_id = p_org and phone_number = v_phone and is_merged_into is null
     limit 1;
  end if;
  -- 3 · COMPLETA o que falta, nunca sobrescreve.
  --     A versão anterior só mexia em `display_name` no conflito, com
  --     `coalesce(existente, novo)`: um nome ruim gravado uma vez congelava para
  --     sempre, e telefone ou lid descobertos depois NUNCA entravam.
  -- O telefone descoberto só sobe para a coluna ÚNICA se ainda não for de outro
  -- contato vivo da org. Sem esta guarda o caso "contato @lid sem telefone + a
  -- mesma pessoa já cadastrada por número" (import, pedido, formulário) estoura
  -- `uniq_contacts_org_phone`; `lib/waha/ingest.ts:343` transforma a exceção em
  -- `return null` e `:459` descarta a mensagem com o webhook respondendo 200 — a
  -- mensagem do cliente some, e some de novo a cada mensagem seguinte daquele
  -- contato. Medido na triagem; não acontece na `main`, é regressão desta
  -- migration. A etapa 2 (busca por telefone) não protege: ela só roda quando a
  -- etapa 1 NÃO achou.
  --
  -- Fundir os dois contatos seria o desfecho semanticamente certo — é a mesma
  -- pessoa, e o `remoteJidAlt` é justamente quem afirma isso. Mas fusão é
  -- IRREVERSÍVEL, e a regra do tempo da doutrina proíbe consumar irreversível no
  -- tempo da máquina, dentro de um webhook. Aqui o dado não se perde: vai para
  -- `source_metadata.telefone_em_conflito`, que não é único, e a decisão de
  -- fundir fica para quem opera.
  if v_id is not null and v_phone is not null and exists (
    select 1 from public.contacts
     where organization_id = p_org and phone_number = v_phone
       and is_merged_into is null and id <> v_id
  ) then
    v_conflito := v_phone;
    v_phone := null;
  end if;
  if v_id is not null then
    update public.contacts set
      phone_number = coalesce(phone_number, v_phone),
      display_name = coalesce(display_name, nullif(p_notify, '')),
      source_metadata = source_metadata
        || case when v_lid is not null then jsonb_build_object('waha_lid', v_lid) else '{}'::jsonb end
        || case when p_chat_id is not null then jsonb_build_object('waha_chat_id', p_chat_id) else '{}'::jsonb end
        || case when nullif(p_notify, '') is not null then jsonb_build_object('notify_name', p_notify) else '{}'::jsonb end
        || case when v_conflito is not null then jsonb_build_object('telefone_em_conflito', v_conflito) else '{}'::jsonb end,
      updated_at = now()
    where id = v_id;
    return v_id;
  end if;
  insert into public.contacts (organization_id, phone_number, source, consent, tags, source_metadata, display_name)
  values (p_org, v_phone, 'whatsapp', '{}'::jsonb, '{}'::text[],
    case when v_lid is not null
      then jsonb_build_object('waha_lid', v_lid, 'waha_chat_id', p_chat_id, 'notify_name', nullif(p_notify, ''))
      else jsonb_build_object('waha_chat_id', p_chat_id, 'notify_name', nullif(p_notify, '')) end,
    nullif(p_notify, ''))
  returning id into v_id;
  return v_id;
end; $$;

update public.contacts
   set display_name = null, updated_at = now()
 where display_name ~ '^Contato [0-9]+(@lid)?$'
   and is_anonymized = false;

create table if not exists public.contact_field_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  campo text not null,
  valor_proposto text not null,
  valor_anterior text,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  trecho text,
  proposed_by_agent_id uuid references public.ai_agents(id) on delete set null,
  status text not null default 'pending',
  proposed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by_user_id uuid references neon_auth.user(id) on delete set null,
  motivo_recusa text,
  updated_at timestamptz not null default now()
);

alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_campo_check;

alter table public.contact_field_proposals
  add constraint contact_field_proposals_campo_check check (
    campo = any (array['email', 'name', 'phone_number']::text[])
  );

alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_status_check;

alter table public.contact_field_proposals
  add constraint contact_field_proposals_status_check check (
    status = any (array['pending', 'accepted', 'dismissed', 'expired']::text[])
  );

alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_prazo_no_futuro;

alter table public.contact_field_proposals
  add constraint contact_field_proposals_prazo_no_futuro check (expires_at > proposed_at);

alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_decisao_datada;

alter table public.contact_field_proposals
  add constraint contact_field_proposals_decisao_datada check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  );

create unique index if not exists uq_contact_field_proposals_uma_viva
  on public.contact_field_proposals (organization_id, contact_id, campo)
  where status = 'pending';

create index if not exists idx_contact_field_proposals_vencendo
  on public.contact_field_proposals (organization_id, expires_at)
  where status = 'pending';

alter table public.contact_field_proposals enable row level security;

drop policy if exists tenant_isolation_contact_field_proposals_all on public.contact_field_proposals;

create policy tenant_isolation_contact_field_proposals_all on public.contact_field_proposals
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

revoke all on public.contact_field_proposals from anon;

create or replace function public.fn_carimba_proposta_de_dado()
  returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    new.proposed_at := now();
  end if;
  new.updated_at := now();
  return new;
end$$;

revoke all on function public.fn_carimba_proposta_de_dado() from public, anon;

drop trigger if exists trg_contact_field_proposals_carimbo on public.contact_field_proposals;

create trigger trg_contact_field_proposals_carimbo
  before insert or update on public.contact_field_proposals
  for each row
  execute function public.fn_carimba_proposta_de_dado();

create or replace function public.fn_apaga_propostas_de_contato_anonimizado()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.contact_field_proposals where contact_id = new.id;
  return new;
end$$;

revoke all on function public.fn_apaga_propostas_de_contato_anonimizado() from public;

revoke execute on function public.fn_apaga_propostas_de_contato_anonimizado() from anon;

revoke execute on function public.fn_apaga_propostas_de_contato_anonimizado() from authenticated;

drop trigger if exists trg_contacts_anonimizado_limpa_propostas on public.contacts;

create trigger trg_contacts_anonimizado_limpa_propostas
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized = true and coalesce(old.is_anonymized, false) = false)
  execute function public.fn_apaga_propostas_de_contato_anonimizado();

alter table public.ai_agent_versions
  add column if not exists pipeline_ids uuid[] not null default '{}'::uuid[];

update public.ai_agent_versions v
   set pipeline_ids = sub.funis
  from (
    select a.actor_agent_id as agent_id,
           array_agg(distinct l.pipeline_id) as funis
      from public.crm_lead_activities a
      join public.crm_leads l on l.id = a.lead_id
     where a.actor_agent_id is not null
     group by a.actor_agent_id
  ) sub
 where v.agent_id = sub.agent_id
   and v.pipeline_ids = '{}'::uuid[];

create or replace function fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    -- ↓ as nove que o trigger nunca cobriu, mais a desta migration
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;

create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function fn_ai_agent_version_content_immutable();

notify pgrst, 'reload schema';

create table if not exists public.org_guardrail_layers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  layer text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, layer)
);

alter table public.org_guardrail_layers enable row level security;

drop policy if exists tenant_isolation_org_guardrail_layers_all on public.org_guardrail_layers;

drop policy if exists org_guardrail_layers_select on public.org_guardrail_layers;

drop policy if exists org_guardrail_layers_admin_write on public.org_guardrail_layers;

create policy org_guardrail_layers_select on public.org_guardrail_layers
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy org_guardrail_layers_admin_write on public.org_guardrail_layers
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'admin'))
  );

revoke all on public.org_guardrail_layers from anon;

alter table followup_enrollments
  add column if not exists timing_plan jsonb;

notify pgrst, 'reload schema';

create index if not exists idx_followup_enrollments_due_por_org
  on followup_enrollments (organization_id, next_eval_at)
  where status in ('active','waiting_reply');

create or replace function fn_claim_due_followup_enrollments(p_limit int, p_lease_seconds int)
returns setof followup_enrollments
language sql
security definer
set search_path = public
as $$
  with orgs as (
    -- Sem a condição de claim aqui de propósito: o lateral abaixo a aplica, e uma
    -- organização cujos vencidos estão todos com lease apenas devolve zero linhas.
    select distinct organization_id
      from followup_enrollments
     where status in ('active','waiting_reply')
       and next_eval_at <= now()
  ),
  fila as (
    select f.id, f.next_eval_at, f.posicao_na_org
      from orgs
      cross join lateral (
        select d.id,
               d.next_eval_at,
               row_number() over (order by d.next_eval_at) as posicao_na_org
          from followup_enrollments d
         where d.organization_id = orgs.organization_id
           and d.status in ('active','waiting_reply')
           and d.next_eval_at <= now()
           and (d.claimed_until is null or d.claimed_until < now())
         order by d.next_eval_at
         limit p_limit
      ) f
  ),
  escolhidos as (
    -- O rodízio: posição 1 de todas as organizações, depois a 2 de todas, etc.
    -- Empate na mesma posição vai para quem esperou mais.
    select id from fila order by posicao_na_org, next_eval_at limit p_limit
  ),
  travados as (
    select e.id from followup_enrollments e
     where e.id in (select id from escolhidos)
     for update skip locked
  )
  update followup_enrollments e
     set claimed_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where e.id in (select id from travados)
     -- A condição de lease É REPETIDA AQUI, e não é redundante com a CTE `fila`.
     -- Sem ela, duas conexões simultâneas reclamam as MESMAS linhas: a segunda
     -- espera o lock da primeira, e quando ele sai o Postgres (READ COMMITTED)
     -- reavalia só o WHERE do UPDATE — que não olhava `claimed_until` — e grava
     -- por cima. O `skip locked` da CTE não salva: as duas materializam a mesma
     -- lista antes de qualquer lock existir. Medido: interseção de 5 em 5 no
     -- invariante de concorrência (followup-schema.test.ts).
     and (e.claimed_until is null or e.claimed_until < now())
  returning e.*;
$$;

revoke execute on function fn_claim_due_followup_enrollments(int, int) from public, anon, authenticated;

do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'followup_enrollments'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%paused_handoff%'
       and pg_get_constraintdef(con.oid) not like '%paused_manual%'
  loop
    execute format('alter table public.followup_enrollments drop constraint %I', c.conname);
  end loop;
end $$;

do $$ begin
  alter table public.followup_enrollments
    add constraint followup_enrollments_status_valido
    check (status in ('active','waiting_reply','paused_handoff','paused_manual','completed','cancelled','dead'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.followup_enrollments
    add constraint followup_enrollments_relogio_coerente
    check (
      (status in ('active','waiting_reply') and next_eval_at is not null)
      or (status in ('paused_handoff','paused_manual','completed','cancelled','dead'))
    );
exception when duplicate_object then null; end $$;

drop index if exists idx_followup_enrollments_one_live;

create unique index if not exists idx_followup_enrollments_one_live
  on public.followup_enrollments (organization_id, contact_id)
  where status in ('active','waiting_reply','paused_handoff','paused_manual');

create index if not exists idx_followup_events_enrollment_tempo
  on public.followup_enrollment_events (enrollment_id, created_at);

notify pgrst, 'reload schema';

alter table public.followup_enrollments
  alter column next_eval_at set default now();

create or replace function public.fn_agora()
returns timestamptz
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select now()
$fn$;

revoke all     on function public.fn_agora() from public;

revoke execute on function public.fn_agora() from anon, authenticated;

grant  execute on function public.fn_agora() to service_role;

create or replace function public.fn_emit_agent_case_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_tipo text;
begin
  v_tipo := case when tg_op = 'INSERT' then 'ai.case_opened' else 'ai.case_closed' end;
  -- O contato viaja no PAYLOAD porque ele sempre existe por schema
  -- (`agent_cases.conversation_id` é not null e `conversations.contact_id` é
  -- not null) e porque poupa o consumidor de uma ida ao banco. O consumidor
  -- mantém o fallback de buscar, para não confiar em convenção.
  select c.contact_id into v_contact_id
    from public.conversations c
   where c.id = new.conversation_id;
  perform public.emit_event(
    v_tipo,
    'agent_case',
    new.id,
    jsonb_build_object(
      'case_id',         new.id,
      'conversation_id', new.conversation_id,
      'contact_id',      v_contact_id,
      'lead_id',         new.lead_id,
      'agent_id',        new.agent_id,
      'source',          new.source,
      'status',          new.status
    ),
    '{}'::jsonb,
    new.organization_id   -- SEMPRE de `new`, nunca de parâmetro: é o filtro de tenant
  );
  return null;            -- AFTER trigger: o retorno é ignorado
end;
$$;

revoke all     on function public.fn_emit_agent_case_event() from public;

revoke execute on function public.fn_emit_agent_case_event() from anon, authenticated;

drop trigger if exists trg_agent_case_opened on public.agent_cases;

create trigger trg_agent_case_opened
  after insert on public.agent_cases
  for each row
  when (new.status in ('awaiting_human','awaiting_lead'))
  execute function public.fn_emit_agent_case_event();

drop trigger if exists trg_agent_case_closed on public.agent_cases;

create trigger trg_agent_case_closed
  after update of status on public.agent_cases
  for each row
  when (old.status is distinct from new.status
        and new.status in ('resolved','escalated','cancelled'))
  execute function public.fn_emit_agent_case_event();

notify pgrst, 'reload schema';

create or replace function public.emit_event(
  p_event_type text,
  p_entity_kind text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_organization_id uuid default null
) returns uuid
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := p_organization_id;
  if v_org_id is null then
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;
  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;
  return v_event_id;
end $$;

create or replace function public.retrieve_top_k_chunks(
  p_organization_id uuid,
  p_kb_version_id uuid,
  p_embedding public.vector,
  p_k integer default 5,
  p_threshold real default 0.40
) returns table (
  chunk_id uuid,
  knowledge_source_id uuid,
  content text,
  similarity real,
  metadata jsonb
)
  language plpgsql stable security definer
  set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'retrieve_top_k_chunks: caller must be an active member of the organization';
  end if;
  return query
  select
    c.id as chunk_id,
    c.knowledge_source_id,
    c.content,
    (1 - (c.embedding <=> p_embedding))::real as similarity,
    c.metadata
  from public.ai_chunks c
  where c.organization_id = p_organization_id
    and c.kb_version_id   = p_kb_version_id
    and (1 - (c.embedding <=> p_embedding)) >= p_threshold
  order by c.embedding <=> p_embedding asc
  limit greatest(p_k, 0);
end $$;

revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from public, anon;

grant  execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

revoke execute on function public.retrieve_top_k_chunks(uuid, uuid, public.vector, integer, real) from public, anon;

grant  execute on function public.retrieve_top_k_chunks(uuid, uuid, public.vector, integer, real) to authenticated, service_role;

do $$
declare
  v_extra text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_extra
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'retrieve_top_k_chunks'
     and p.oid::regprocedure::text <> 'retrieve_top_k_chunks(uuid,uuid,vector,integer,real)';
  if v_extra is not null then
    raise warning '0149: sobrecarga inesperada de retrieve_top_k_chunks sem o guard de membership: %', v_extra;
  end if;
end $$;

notify pgrst, 'reload schema';

drop policy if exists channel_sessions_tenant_isolation_all on public.channel_sessions;

drop policy if exists channel_sessions_tenant_select on public.channel_sessions;

create policy channel_sessions_tenant_select on public.channel_sessions
  for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

drop policy if exists channel_sessions_tenant_write on public.channel_sessions;

create policy channel_sessions_tenant_write on public.channel_sessions
  for all using (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );

drop policy if exists tenant_isolation_ai_agents_all on public.ai_agents;

drop policy if exists tenant_isolation_ai_agents_select on public.ai_agents;

create policy tenant_isolation_ai_agents_select on public.ai_agents
  for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

drop policy if exists tenant_isolation_ai_agents_write on public.ai_agents;

create policy tenant_isolation_ai_agents_write on public.ai_agents
  for all using (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );

drop policy if exists tenant_isolation_ai_agent_versions_all on public.ai_agent_versions;

drop policy if exists tenant_isolation_ai_agent_versions_select on public.ai_agent_versions;

create policy tenant_isolation_ai_agent_versions_select on public.ai_agent_versions
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_agent_versions_write on public.ai_agent_versions;

create policy tenant_isolation_ai_agent_versions_write on public.ai_agent_versions
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

drop policy if exists tenant_isolation_ai_budgets_all on public.ai_budgets;

drop policy if exists tenant_isolation_ai_budgets_select on public.ai_budgets;

create policy tenant_isolation_ai_budgets_select on public.ai_budgets
  for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

drop policy if exists tenant_isolation_ai_budgets_write on public.ai_budgets;

create policy tenant_isolation_ai_budgets_write on public.ai_budgets
  for all using (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );

drop policy if exists tenant_isolation_ai_routers_all on public.ai_routers;

drop policy if exists tenant_isolation_ai_routers_select on public.ai_routers;

create policy tenant_isolation_ai_routers_select on public.ai_routers
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_routers_write on public.ai_routers;

create policy tenant_isolation_ai_routers_write on public.ai_routers
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

drop policy if exists tenant_isolation_ai_router_members_all on public.ai_router_members;

drop policy if exists tenant_isolation_ai_router_members_select on public.ai_router_members;

create policy tenant_isolation_ai_router_members_select on public.ai_router_members
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_router_members_write on public.ai_router_members;

create policy tenant_isolation_ai_router_members_write on public.ai_router_members
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

drop policy if exists tenant_isolation_ai_purpose_bindings_all on public.ai_purpose_bindings;

drop policy if exists tenant_isolation_ai_purpose_bindings_select on public.ai_purpose_bindings;

create policy tenant_isolation_ai_purpose_bindings_select on public.ai_purpose_bindings
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_purpose_bindings_write on public.ai_purpose_bindings;

create policy tenant_isolation_ai_purpose_bindings_write on public.ai_purpose_bindings
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

drop policy if exists tenant_isolation_ai_provider_credentials_select on public.ai_provider_credentials;

drop policy if exists tenant_isolation_ai_provider_credentials_modify on public.ai_provider_credentials;

drop policy if exists tenant_isolation_ai_provider_credentials_write on public.ai_provider_credentials;

create policy tenant_isolation_ai_provider_credentials_write on public.ai_provider_credentials
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

revoke select on public.ai_provider_credentials from authenticated, anon;

grant select (
  id, organization_id, provider, label, api_key_last4, validated_at,
  validation_error, models_available, is_active, created_by, created_at, updated_at
) on public.ai_provider_credentials to authenticated;

grant select on public.ai_provider_credentials_safe to authenticated;

notify pgrst, 'reload schema';

create or replace function public.fn_aplicar_quadro_do_onboarding(
  p_organization_id uuid,
  p_pipeline_id uuid,
  p_nome text,
  p_slug text,
  p_etapas jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_negocios bigint;
  v_fontes bigint;
  v_criadas bigint;
begin
  -- O funil é DESTA organização? A função roda como `postgres` e passa por cima
  -- da RLS; o filtro de tenant é responsabilidade dela.
  perform 1 from public.crm_pipelines
   where id = p_pipeline_id and organization_id = p_organization_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'funil_nao_encontrado');
  end if;
  select count(*) into v_negocios
    from public.crm_leads
   where pipeline_id = p_pipeline_id
     and organization_id = p_organization_id;
  if v_negocios > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'funil_com_negocios', 'quantos', v_negocios);
  end if;
  -- ON DELETE CASCADE: sem esta recusa, trocar as colunas apaga a fonte inteira.
  select count(*) into v_fontes
    from public.webhook_sources w
    join public.crm_stages s on s.id = w.default_stage_id
   where s.pipeline_id = p_pipeline_id;
  if v_fontes > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'etapa_em_uso_por_webhook', 'quantos', v_fontes);
  end if;
  delete from public.crm_stages
   where pipeline_id = p_pipeline_id
     and organization_id = p_organization_id;
  insert into public.crm_stages
    (organization_id, pipeline_id, name, slug, position, is_won, is_lost, agent_stage_hint)
  select p_organization_id,
         p_pipeline_id,
         e->>'nome',
         e->>'slug',
         (e->>'position')::numeric,
         coalesce((e->>'is_won')::boolean, false),
         coalesce((e->>'is_lost')::boolean, false),
         nullif(e->>'agent_stage_hint', '')
    from jsonb_array_elements(p_etapas) as e;
  get diagnostics v_criadas = row_count;
  update public.crm_pipelines
     set name = p_nome,
         slug = p_slug,
         updated_at = now()
   where id = p_pipeline_id
     and organization_id = p_organization_id;
  return jsonb_build_object('ok', true, 'etapas', v_criadas);
end$$;

revoke execute on function public.fn_aplicar_quadro_do_onboarding(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.fn_aplicar_quadro_do_onboarding(uuid, uuid, text, text, jsonb)
  to service_role;

create or replace function public.fn_definir_marca_da_organizacao(
  p_org   uuid,
  p_actor uuid,
  p_marca jsonb
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
  v_hex    text;
  v_limpar boolean;
begin
  if p_org is null or p_actor is null then
    raise exception 'marca_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;
  -- "Apague a marca" chega por DUAS formas — SQL NULL e o jsonb `'null'` — e as
  -- duas significam a mesma coisa. NÃO MEDIDO qual delas o PostgREST produz para
  -- `{"p_marca": null}`; tratar só uma deixaria a limpeza levantando 22023 num
  -- dos dois transportes.
  v_limpar := p_marca is null or jsonb_typeof(p_marca) = 'null';
  if not v_limpar and jsonb_typeof(p_marca) <> 'object' then
    raise exception 'marca_da_organizacao_forma_invalida: %', jsonb_typeof(p_marca)
      using errcode = '22023';
  end if;
  -- MESMA regex do CHECK `platform_branding_accent_hex` — que é a forma que
  -- `normalizarHex` emite. Aceitar `#FFF` criaria duas grafias da mesma cor e a
  -- pergunta "mudou?" passaria a mentir. Dentro de jsonb não cabe CHECK de
  -- coluna, então a regra é da função.
  v_hex := nullif(p_marca ->> 'accent_hex', '');
  if v_hex is not null and v_hex !~ '^#[0-9a-f]{6}$' then
    raise exception 'marca_da_organizacao_accent_hex_invalido'
      using errcode = '22023';
  end if;
  -- Papel insuficiente falha ALTO (42501) em vez de devolver 0: 0 já significa
  -- "a organização não existe", e colapsar os dois deixaria o chamador sem saber
  -- se o problema é papel ou id.
  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'marca_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;
  update public.organizations o
     set settings = case
           when v_limpar
             then coalesce(o.settings, '{}'::jsonb) - 'branding'
           else jsonb_set(coalesce(o.settings, '{}'::jsonb), '{branding}', p_marca, true)
         end
   where o.id = p_org;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant  execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';

create or replace function public.fn_definir_logo_da_organizacao(
  p_org   uuid,
  p_actor uuid,
  p_path  text
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
  v_path   text;
begin
  if p_org is null or p_actor is null then
    raise exception 'logo_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;
  v_path := nullif(btrim(coalesce(p_path, '')), '');
  -- O PREFIXO ASSEVERADO DENTRO DO BANCO — o gate que sobrevive ao segundo
  -- chamador. A rota monta o caminho a partir da organização resolvida do
  -- cookie, mas "a rota monta certo" é promessa de UM chamador. Sem esta linha,
  -- um caminho de outro escopo (o `platform/...` que qualquer pessoa lê no HTML
  -- da tela de login) entraria como logo da organização — e o delete-on-replace
  -- da rota, rodando como `service_role`, apagaria o logo da instalação inteira
  -- na troca seguinte.
  if v_path is not null
     and v_path !~ ('^' || p_org::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$')
  then
    raise exception 'logo_da_organizacao_caminho_fora_do_escopo'
      using errcode = '22023';
  end if;
  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'logo_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;
  -- Merge no CAMPO. `jsonb_set` direto em '{branding,logo_path}' NÃO serviria:
  -- com `branding` ausente, `create_missing` só cria a ÚLTIMA chave e o caminho
  -- intermediário faltando devolve o jsonb original intocado — silenciosamente.
  update public.organizations o
     set settings = case
           when v_path is null
             then jsonb_set(
                    coalesce(o.settings, '{}'::jsonb), '{branding}',
                    coalesce(o.settings -> 'branding', '{}'::jsonb) - 'logo_path', true)
           else jsonb_set(
                    coalesce(o.settings, '{}'::jsonb), '{branding}',
                    coalesce(o.settings -> 'branding', '{}'::jsonb)
                      || jsonb_build_object('logo_path', v_path), true)
         end
   where o.id = p_org;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

create or replace function public.fn_definir_marca_da_organizacao(
  p_org   uuid,
  p_actor uuid,
  p_marca jsonb
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
  v_hex    text;
  v_limpar boolean;
begin
  if p_org is null or p_actor is null then
    raise exception 'marca_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;
  v_limpar := p_marca is null or jsonb_typeof(p_marca) = 'null';
  if not v_limpar and jsonb_typeof(p_marca) <> 'object' then
    raise exception 'marca_da_organizacao_forma_invalida: %', jsonb_typeof(p_marca)
      using errcode = '22023';
  end if;
  v_hex := nullif(p_marca ->> 'accent_hex', '');
  if v_hex is not null and v_hex !~ '^#[0-9a-f]{6}$' then
    raise exception 'marca_da_organizacao_accent_hex_invalido'
      using errcode = '22023';
  end if;
  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'marca_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;
  update public.organizations o
     set settings = case
           -- "Limpar" com logo gravado NÃO apaga o logo: o campo tem controle
           -- próprio na tela, e limpar nome+cor responde a OUTRA pergunta.
           when v_limpar and coalesce(o.settings #>> '{branding,logo_path}', '') = ''
             then coalesce(o.settings, '{}'::jsonb) - 'branding'
           when v_limpar
             then jsonb_set(
                    coalesce(o.settings, '{}'::jsonb), '{branding}',
                    jsonb_build_object('logo_path', o.settings #> '{branding,logo_path}'), true)
           -- `p_marca || preservado`: o lado DIREITO vence em `||`, então o
           -- `logo_path` gravado sobrevive à substituição do objeto.
           -- `jsonb_strip_nulls` SÓ no fragmento preservado — nunca em `p_marca`,
           -- cujo `app_name: null` é um valor com significado.
           else jsonb_set(
                    coalesce(o.settings, '{}'::jsonb), '{branding}',
                    p_marca || jsonb_strip_nulls(
                      jsonb_build_object('logo_path', o.settings #> '{branding,logo_path}')), true)
         end
   where o.id = p_org;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke execute on function public.fn_definir_logo_da_organizacao(uuid, uuid, text)
  from public, anon, authenticated;

grant  execute on function public.fn_definir_logo_da_organizacao(uuid, uuid, text)
  to service_role;

revoke execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb)
  from public, anon, authenticated;

grant  execute on function public.fn_definir_marca_da_organizacao(uuid, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';

create or replace function public.fn_gasto_de_ia_do_mes(p_org uuid)
returns numeric
  language sql
  stable
  security invoker
  set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(cost_cents), 0)::numeric
    from public.llm_calls
   where organization_id = p_org
     and created_at >= date_trunc('month', now());
$$;

revoke execute on function public.fn_gasto_de_ia_do_mes(uuid)
  from public, anon, authenticated;

grant  execute on function public.fn_gasto_de_ia_do_mes(uuid)
  to service_role;

notify pgrst, 'reload schema';

create or replace function public.fn_mark_conversation_message(
  p_conv uuid, p_direction text, p_preview text, p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = p_at, last_message_preview = p_preview,
    last_inbound_at  = case when p_direction = 'inbound'  then p_at else last_inbound_at  end,
    last_outbound_at = case when p_direction = 'outbound' then p_at else last_outbound_at end,
    unread_count_for_assignee = case
      when p_direction = 'inbound'  then unread_count_for_assignee + 1
      when p_direction = 'outbound' then 0
      else unread_count_for_assignee
    end,
    updated_at = now()
  where id = p_conv;
end; $$;

update public.conversations c
set unread_count_for_assignee = coalesce((
  select count(*)::integer
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'inbound'
    and m.sent_at > coalesce(c.last_outbound_at, '-infinity'::timestamptz)
), 0)
where unread_count_for_assignee <> coalesce((
  select count(*)::integer
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'inbound'
    and m.sent_at > coalesce(c.last_outbound_at, '-infinity'::timestamptz)
), 0);

notify pgrst, 'reload schema';

create or replace function public.fn_mark_conversation_message(
  p_conv uuid, p_direction text, p_preview text, p_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = p_at, last_message_preview = p_preview,
    last_inbound_at  = case when p_direction = 'inbound'  then p_at else last_inbound_at  end,
    last_outbound_at = case when p_direction = 'outbound' then p_at else last_outbound_at end,
    unread_count_for_assignee = case
      when p_direction = 'inbound'  then unread_count_for_assignee + 1
      when p_direction = 'outbound' then 0
      else unread_count_for_assignee
    end,
    updated_at = now()
  where id = p_conv;
  update public.contacts c
     set last_activity_at = greatest(coalesce(c.last_activity_at, '-infinity'::timestamptz), p_at)
    from public.conversations v
   where v.id = p_conv
     and c.id = v.contact_id;
end; $$;

update public.contacts c
   set last_activity_at = sub.max_at
  from (
    select contact_id, max(last_message_at) as max_at
      from public.conversations
     where last_message_at is not null
     group by contact_id
  ) sub
 where c.id = sub.contact_id
   and coalesce(c.last_activity_at, '-infinity'::timestamptz) < sub.max_at;

notify pgrst, 'reload schema';

create or replace function public.fn_estampar_atribuicao_de_anuncio(
  p_contact uuid,
  p_platform text,
  p_metadata jsonb
) returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update public.contacts
  set
    source = p_platform,
    source_metadata = source_metadata || p_metadata,
    updated_at = now()
  where id = p_contact
    and source_metadata->>'ad_platform' is null;
end;
$$;

revoke execute on function public.fn_estampar_atribuicao_de_anuncio(uuid, text, jsonb) from public, anon, authenticated;

grant  execute on function public.fn_estampar_atribuicao_de_anuncio(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';

create index if not exists idx_job_queue_poda
  on public.job_queue (created_at)
  where status in ('done', 'failed', 'dead');

create index if not exists idx_audit_expurgo_created_at
  on public.api_audit_log (created_at);

create index if not exists idx_agent_inbox_items_ref_aberto
  on public.agent_inbox_items (ref_kind, ref_id)
  where status = 'open';

create or replace function public.fn_podar_fila_de_jobs(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Piso de 7 dias: abaixo disso a cascata em `send_ledger` mexeria no horizonte
  -- em que "1º outbound" ainda diz algo sobre um lead vivo.
  v_dias int := greatest(coalesce(p_retencao_dias, 90), 7);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_apagados int;
begin
  with candidatos as (
    select j.id
      from public.job_queue j
     where j.status in ('done', 'failed', 'dead')
       and j.created_at < now() - make_interval(days => v_dias)
       and not exists (
         select 1
           from public.agent_inbox_items i
          where i.ref_kind = 'job_queue'
            and i.ref_id = j.id
            and i.status = 'open'
       )
     order by j.created_at
     limit v_limite
  )
  delete from public.job_queue j
   using candidatos c
   where j.id = c.id;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

create or replace function public.fn_expurgar_auditoria_vencida(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 1825 dias = os 5 anos da regra L-10; o piso de 90 impede que o knob vire
  -- apagador de rastro recente.
  v_dias int := greatest(coalesce(p_retencao_dias, 1825), 90);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_apagadas int;
begin
  with vencidas as (
    select a.id
      from public.api_audit_log a
     where a.created_at < now() - make_interval(days => v_dias)
     order by a.created_at
     limit v_limite
  )
  delete from public.api_audit_log a
   using vencidas v
   where a.id = v.id;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke execute on function public.fn_podar_fila_de_jobs(int, int)
  from public, anon, authenticated;

grant  execute on function public.fn_podar_fila_de_jobs(int, int)
  to service_role;

revoke execute on function public.fn_expurgar_auditoria_vencida(int, int)
  from public, anon, authenticated;

grant  execute on function public.fn_expurgar_auditoria_vencida(int, int)
  to service_role;

notify pgrst, 'reload schema';

create or replace function public.fn_conversation_assign(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_expected_assignee uuid default null,
  p_enforce_expected boolean default false
) returns setof public.conversations
language plpgsql security definer
set search_path = public
as $$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;
  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
   for update;
  if not found then
    return;
  end if;
  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;
  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         -- A trava só é solta por quem a pôs. `last_handoff_at` é o discriminador
         -- que já existe: uma ESCALAÇÃO o carimba (`performHumanHandoff` e
         -- `triggerHandoff`), um humano ASSUMINDO não. Sem esta condição, o
         -- release apagaria o silêncio de uma conversa que a IA escalou — e o
         -- caminho legado (`triggerHandoff`, usado pelo MCP, pelo handler de
         -- sentimento, pelo worker e pelo teto de gasto) NÃO grava
         -- `contacts.force_human`, então ali o silêncio é a ÚNICA trava. Medido:
         -- `grep -n force_human lib/ai/handoff/orchestrator.ts` → rc=1.
         -- Soltar de propósito é o botão "Devolver ao automático"
         -- (`devolverAtendimentoAoAgente`), que limpa as três travas de uma vez.
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then (case when last_handoff_at is null
                                                 then null
                                                 else bot_silenced_until end)
           else 'infinity'::timestamptz
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;
  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);
  return next v_conv;
end;
$$;

revoke all     on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from public;

revoke execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from anon;

grant  execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean)
  to authenticated, service_role;

drop policy if exists cae_select on public.conversation_assignment_events;

create policy cae_select on public.conversation_assignment_events
  for select using (
    public.fn_is_platform_admin()
    or (
      organization_id in (select public.fn_user_org_ids())
      and exists (
        select 1
          from public.conversations c
         where c.id = conversation_assignment_events.conversation_id
      )
    )
  );

create or replace function public.fn_redigir_captacoes_do_contato_anonimizado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.webhook_lead_captures
     set captured_name = null,
         captured_phone = null,
         captured_email = null,
         fields = '{}'::jsonb,
         utm = '{}'::jsonb,
         remote_ip = null,
         user_agent = null
   where organization_id = new.organization_id
     and contact_id = new.id;
  return new;
end;
$$;

revoke execute on function public.fn_redigir_captacoes_do_contato_anonimizado() from public, anon, authenticated;

grant execute on function public.fn_redigir_captacoes_do_contato_anonimizado() to service_role;

notify pgrst, 'reload schema';

alter table public.messages add column if not exists edited_at timestamptz;

alter table public.messages add column if not exists revoked_at timestamptz;

alter table public.meta_templates
  add column if not exists channel_session_id uuid
    references public.channel_sessions(id) on delete set null;

create index if not exists meta_templates_sessao_idx
  on public.meta_templates (channel_session_id, status)
  where channel_session_id is not null;

create table if not exists public.platform_branding (
  id                  smallint primary key default 1,
  app_name            text,
  logo_url            text,
  accent_hex          text,
  show_powered_by     boolean     not null default true,
  seeded_from_env     boolean     not null default false,
  fallback_at         timestamptz,
  fallback_reason     text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  constraint platform_branding_singleton  check (id = 1),
  constraint platform_branding_accent_hex check (accent_hex is null or accent_hex ~ '^#[0-9a-f]{6}$')
);

alter table public.platform_branding enable row level security;

revoke all on public.platform_branding from anon, authenticated;

grant select, insert, update on public.platform_branding to service_role;

drop trigger if exists trg_platform_branding_touch on public.platform_branding;

create trigger trg_platform_branding_touch
  before update on public.platform_branding
  for each row execute function public.fn_touch_updated_at();

notify pgrst, 'reload schema';

alter table public.platform_branding
  add column if not exists logo_path text;

update public.platform_branding
   set logo_path = null
 where logo_path is not null
   and logo_path !~ '^platform/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$';

alter table public.platform_branding
  drop constraint if exists platform_branding_logo_path;

alter table public.platform_branding
  add constraint platform_branding_logo_path check (
    logo_path is null
    or logo_path ~ '^platform/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
  );

notify pgrst, 'reload schema';

alter table public.ai_budgets
  add column if not exists enforcement_mode text not null default 'off';

alter table public.ai_budgets
  add column if not exists enforcement_effective_at timestamptz;

insert into public.ai_budgets (organization_id)
select o.id from public.organizations o
 where jsonb_typeof(o.settings->'llm'->'monthly_budget_cents') = 'number'
   and (o.settings->'llm'->>'monthly_budget_cents')::numeric >= 100
   and (o.settings->'llm'->>'monthly_budget_cents')::numeric <= 2147483647
on conflict (organization_id) do nothing;

update public.ai_budgets b
   set monthly_limit_cents      = (o.settings->'llm'->>'monthly_budget_cents')::numeric::integer,
       enforcement_mode         = 'bloquear',
       enforcement_effective_at = now(),
       updated_at               = now()
  from public.organizations o
 where o.id = b.organization_id
   and jsonb_typeof(o.settings->'llm'->'monthly_budget_cents') = 'number'
   and (o.settings->'llm'->>'monthly_budget_cents')::numeric >= 100
   and (o.settings->'llm'->>'monthly_budget_cents')::numeric <= 2147483647;

update public.organizations
   set settings = jsonb_set(settings, '{llm}', (settings->'llm') - 'monthly_budget_cents')
 where jsonb_typeof(settings->'llm') = 'object'
   and settings->'llm' ? 'monthly_budget_cents';

update public.ai_budgets set is_throttled = false where is_throttled;

alter table public.ai_budgets
  drop constraint if exists ai_budgets_enforcement_mode_check;

alter table public.ai_budgets
  add constraint ai_budgets_enforcement_mode_check
  check (enforcement_mode in ('off', 'avisar', 'bloquear'));

alter table public.ai_budgets
  drop constraint if exists ai_budgets_bloquear_precisa_de_teto;

alter table public.ai_budgets
  add constraint ai_budgets_bloquear_precisa_de_teto
  check (enforcement_mode <> 'bloquear' or monthly_limit_cents >= 100);

insert into public.agent_inbox_items (organization_id, kind, severity, title, body, ref_kind, ref_id)
select b.organization_id, 'budget_warning', 'info',
       'A pausa antiga de IA por gasto foi desligada',
       'Esta organização estava marcada como desabilitada por gasto num mecanismo '
       'que nunca teve como ser reativado. Para voltar a parar a IA no limite, use '
       'Uso de IA › Orçamento e escolha "Parar a IA ao chegar no limite".',
       'ai_budget', b.organization_id
  from public.ai_budgets b
 where b.is_disabled
   and not exists (
     select 1 from public.agent_inbox_items i
      where i.organization_id = b.organization_id
        and i.kind = 'budget_warning' and i.status = 'open'
   );

notify pgrst, 'reload schema';

revoke insert, update, delete on table public.ai_budgets from authenticated, anon;

alter table public.webhook_events_log
  alter column raw_body drop not null;

create index if not exists webhook_events_log_a_esvaziar_idx
  on public.webhook_events_log (received_at)
  where archived_at is null;

notify pgrst, 'reload schema';

do $$
declare
  v_relkind "char";
  v_def     text;
  v_tabela  text;
begin
  select c.relkind,
         case when c.relkind in ('i', 'I') then pg_get_indexdef(c.oid) end,
         t.relname
    into v_relkind, v_def, v_tabela
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_index i on i.indexrelid = c.oid
    left join pg_class t on t.oid = i.indrelid
   where n.nspname = 'public'
     and c.relname = 'idx_job_queue_running';
  if v_relkind is null then
    return;
  end if;
  if v_relkind not in ('i', 'I') or v_tabela is distinct from 'job_queue' then
    raise exception
      'o nome idx_job_queue_running já está tomado em public (relkind=%, tabela=%). '
      'Nome de índice é único por SCHEMA, então o create index if not exists desta '
      'atualização vira no-op silencioso e o claim da fila continua varrendo a tabela '
      'inteira a cada rodada. Não apago o objeto porque ele não é nosso: renomeie-o e '
      'rode a atualização de novo.', v_relkind, coalesce(v_tabela, '(nenhuma)');
  end if;
  if v_def !~ 'USING btree \(status\)' or v_def !~ 'WHERE \(status = ''running''' then
    execute 'drop index public.idx_job_queue_running';
  end if;
end
$$;

create index if not exists idx_job_queue_running
  on job_queue (status) where status = 'running';

with ativos as (
  select id,
         row_number() over (
           partition by meta_phone_number_id
           order by created_at desc nulls last, id desc
         ) as posicao
    from public.channel_sessions
   where archived_at is null
     and meta_phone_number_id is not null
)
update public.channel_sessions s
   set meta_phone_number_id = s.meta_phone_number_id || '-conflito-' || s.id::text
  from ativos a
 where a.id = s.id
   and a.posicao > 1;

create unique index if not exists channel_sessions_meta_phone_number_id_ativo_unique
  on public.channel_sessions (meta_phone_number_id)
  where archived_at is null and meta_phone_number_id is not null;

with ativos as (
  select id,
         row_number() over (
           partition by zernio_account_id
           order by created_at desc nulls last, id desc
         ) as posicao
    from public.channel_sessions
   where archived_at is null
     and zernio_account_id is not null
)
update public.channel_sessions s
   set zernio_account_id = s.zernio_account_id || '-conflito-' || s.id::text
  from ativos a
 where a.id = s.id
   and a.posicao > 1;

create unique index if not exists channel_sessions_zernio_account_id_ativo_unique
  on public.channel_sessions (zernio_account_id)
  where archived_at is null and zernio_account_id is not null;

alter table public.messages
  add column if not exists reply_to_message_id uuid
    references public.messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

notify pgrst, 'reload schema';

create table if not exists public.webhook_lead_captures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_source_id uuid references public.webhook_sources(id) on delete set null,
  source_name text not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  outcome text not null
    check (outcome in ('criado', 'duplicado', 'recusado')),
  reject_reason text,
  captured_name text,
  captured_phone text,
  captured_email text,
  fields jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  remote_ip inet,
  user_agent text,
  origin text,
  request_id uuid,
  received_at timestamptz not null default now()
);

create index if not exists webhook_lead_captures_org_recebido_idx
  on public.webhook_lead_captures (organization_id, received_at desc, id desc);

create index if not exists webhook_lead_captures_fonte_idx
  on public.webhook_lead_captures (webhook_source_id, received_at desc)
  where webhook_source_id is not null;

create index if not exists webhook_lead_captures_lead_idx
  on public.webhook_lead_captures (lead_id)
  where lead_id is not null;

create index if not exists webhook_lead_captures_poda_idx
  on public.webhook_lead_captures (received_at);

alter table public.webhook_lead_captures enable row level security;

drop policy if exists "webhook_lead_captures_manager_read" on public.webhook_lead_captures;

create policy "webhook_lead_captures_manager_read" on public.webhook_lead_captures
  for select using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop trigger if exists trg_redigir_captacoes_ao_anonimizar on public.contacts;

create trigger trg_redigir_captacoes_ao_anonimizar
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized is true and old.is_anonymized is distinct from true)
  execute function public.fn_redigir_captacoes_do_contato_anonimizado();

alter table public.automation_rule_runs
  drop constraint if exists automation_rule_runs_status_check;

alter table public.automation_rule_runs
  add constraint automation_rule_runs_status_check check (status in (
    'success',
    'partial',
    'failed',
    'adiado'
  ));

notify pgrst, 'reload schema';

alter table public.channel_sessions
  add column if not exists evolution_instance_name text;

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'evolution_go'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'        and waha_session_name is not null) or
    (provider = 'meta_cloud'  and meta_phone_number_id is not null) or
    (provider = 'zernio'      and zernio_account_id is not null) or
    (provider = 'evolution_go' and evolution_instance_name is not null)
  );

with actifs as (
  select id,
         row_number() over (
           partition by evolution_instance_name
           order by created_at desc nulls last, id desc
         ) as position
    from public.channel_sessions
   where archived_at is null
     and provider = 'evolution_go'
     and evolution_instance_name is not null
)
update public.channel_sessions s
   set evolution_instance_name = s.evolution_instance_name || '-conflit-' || s.id::text
  from actifs a
 where a.id = s.id
   and a.position > 1;

create unique index if not exists channel_sessions_evolution_instance_name_active_unique
  on public.channel_sessions (evolution_instance_name)
  where archived_at is null
    and provider = 'evolution_go'
    and evolution_instance_name is not null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'XAF' check (currency ~ '^[A-Z]{3}$'),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index if not exists idx_sales_products_org_active
  on public.products (organization_id, is_active, created_at desc);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  storage_key text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_key),
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete cascade
);

create index if not exists idx_sales_product_media_product
  on public.product_media (organization_id, product_id, created_at desc);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  status text not null default 'en_cours'
    check (status in ('en_cours', 'en_attente_paiement', 'payée', 'a_livrer', 'livree', 'refusee', 'annulee')),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'XAF' check (currency ~ '^[A-Z]{3}$'),
  created_by_user_id uuid references neon_auth.user(id) on delete set null,
  paid_at timestamptz,
  paid_by_user_id uuid references neon_auth.user(id) on delete set null,
  fulfillment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status = 'payée') = (paid_at is not null and paid_by_user_id is not null)),
  check (status <> 'payée' or paid_at is not null)
);

create index if not exists idx_sales_orders_org_status
  on public.sales_orders (organization_id, status, updated_at desc);

create index if not exists idx_sales_orders_conversation
  on public.sales_orders (organization_id, conversation_id, created_at desc);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  product_id uuid not null,
  product_title text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  currency text not null default 'XAF' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.sales_orders(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete restrict
);

create index if not exists idx_sales_order_items_order
  on public.sales_order_items (organization_id, order_id);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  message_id uuid references public.messages(id) on delete set null,
  storage_key text not null,
  mime_type text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  reference text,
  operator text,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  extraction jsonb not null default '{}'::jsonb,
  reviewed_by_user_id uuid references neon_auth.user(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.sales_orders(id, organization_id) on delete cascade,
  check ((review_status = 'pending') = (reviewed_at is null and reviewed_by_user_id is null)),
  check (review_status <> 'approved' or (reviewed_at is not null and reviewed_by_user_id is not null))
);

create index if not exists idx_payment_proofs_org_review
  on public.payment_proofs (organization_id, review_status, created_at desc);

create index if not exists idx_payment_proofs_order
  on public.payment_proofs (organization_id, order_id, created_at desc);

drop trigger if exists trg_sales_products_updated_at on public.products;

create trigger trg_sales_products_updated_at before update on public.products
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_sales_orders_updated_at on public.sales_orders;

create trigger trg_sales_orders_updated_at before update on public.sales_orders
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_payment_proofs_updated_at on public.payment_proofs;

create trigger trg_payment_proofs_updated_at before update on public.payment_proofs
  for each row execute function public.fn_set_updated_at();

alter table public.products enable row level security;

drop policy if exists sales_products_select on public.products;

create policy sales_products_select on public.products for select using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists sales_products_insert on public.products;

create policy sales_products_insert on public.products for insert with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager'));

drop policy if exists sales_products_update on public.products;

create policy sales_products_update on public.products for update using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager')) with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager'));

drop policy if exists sales_products_delete on public.products;

create policy sales_products_delete on public.products for delete using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager'));

alter table public.product_media enable row level security;

drop policy if exists sales_product_media_select on public.product_media;

create policy sales_product_media_select on public.product_media for select using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists sales_product_media_write on public.product_media;

create policy sales_product_media_write on public.product_media for all using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager')) with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager'));

alter table public.sales_orders enable row level security;

drop policy if exists sales_orders_select on public.sales_orders;

create policy sales_orders_select on public.sales_orders for select using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists sales_orders_write on public.sales_orders;

create policy sales_orders_write on public.sales_orders for all using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent')) with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

alter table public.sales_order_items enable row level security;

drop policy if exists sales_order_items_select on public.sales_order_items;

create policy sales_order_items_select on public.sales_order_items for select using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists sales_order_items_write on public.sales_order_items;

create policy sales_order_items_write on public.sales_order_items for all using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent')) with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

alter table public.payment_proofs enable row level security;

drop policy if exists payment_proofs_select on public.payment_proofs;

create policy payment_proofs_select on public.payment_proofs for select using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists payment_proofs_write on public.payment_proofs;

create policy payment_proofs_write on public.payment_proofs for all using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent')) with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));

revoke all on public.products, public.product_media, public.sales_orders, public.sales_order_items, public.payment_proofs from anon;

create or replace function public.fn_approve_sales_payment(
  p_organization_id uuid,
  p_order_id uuid,
  p_proof_id uuid,
  p_reviewer_id uuid
) returns public.sales_orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_reviewer_id then
    raise exception 'payment_reviewer_mismatch';
  end if;
  if coalesce(public.fn_member_role_in_org(p_reviewer_id, p_organization_id), 'none') not in ('agent', 'manager', 'admin') and not public.fn_is_platform_admin() then
    raise exception 'payment_reviewer_not_authorized';
  end if;
  select * into v_order from public.sales_orders where id = p_order_id and organization_id = p_organization_id for update;
  if not found then raise exception 'sales_order_not_found'; end if;
  if v_order.status <> 'en_attente_paiement' then raise exception 'invalid_order_transition' using hint = 'only an order awaiting payment can be approved'; end if;
  if not exists (select 1 from public.payment_proofs where id = p_proof_id and order_id = p_order_id and organization_id = p_organization_id and review_status = 'pending') then
    raise exception 'payment_proof_not_pending';
  end if;
  update public.payment_proofs set review_status = 'approved', reviewed_by_user_id = p_reviewer_id, reviewed_at = now()
   where id = p_proof_id and organization_id = p_organization_id;
  update public.sales_orders set status = 'payée', paid_at = now(), paid_by_user_id = p_reviewer_id, updated_at = now()
   where id = p_order_id and organization_id = p_organization_id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.fn_approve_sales_payment(uuid, uuid, uuid, uuid) from public, anon;

grant execute on function public.fn_approve_sales_payment(uuid, uuid, uuid, uuid) to authenticated, service_role;

alter table public.sales_orders add column if not exists idempotency_key text;

create unique index if not exists idx_sales_orders_org_idempotency
  on public.sales_orders (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.fn_create_sales_order(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_contact_id uuid,
  p_items jsonb,
  p_currency text,
  p_created_by uuid,
  p_idempotency_key text default null
) returns public.sales_orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_total bigint := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_created_by then raise exception 'sales_order_creator_mismatch'; end if;
  -- Appel depuis une session : le créateur doit être membre (agent+) de l'organisation visée.
  if auth.uid() is not null
     and coalesce(public.fn_member_role_in_org(auth.uid(), p_organization_id), 'none') not in ('agent', 'manager', 'admin')
     and not public.fn_is_platform_admin() then
    raise exception 'sales_order_not_authorized';
  end if;
  if p_idempotency_key is not null then
    select * into v_order from public.sales_orders where organization_id = p_organization_id and idempotency_key = p_idempotency_key for update;
    if found then return v_order; end if;
  end if;
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.organization_id = p_organization_id and c.contact_id = p_contact_id) then
    raise exception 'forbidden_cross_tenant' using hint = 'conversation and contact must belong to the same organization';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'invalid_order_items'; end if;
  insert into public.sales_orders (organization_id, conversation_id, contact_id, status, total_cents, currency, created_by_user_id, idempotency_key)
  values (p_organization_id, p_conversation_id, p_contact_id, 'en_cours', 0, p_currency, p_created_by, p_idempotency_key)
  returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity <= 0 then raise exception 'invalid_order_quantity'; end if;
    select * into v_product from public.products where id = v_product_id and organization_id = p_organization_id and is_active = true for update;
    if not found then raise exception 'product_not_found'; end if;
    if v_product.currency <> p_currency then raise exception 'currency_mismatch'; end if;
    if v_product.stock < v_quantity then raise exception 'out_of_stock'; end if;
    update public.products set stock = stock - v_quantity, updated_at = now() where id = v_product.id and organization_id = p_organization_id;
    insert into public.sales_order_items (organization_id, order_id, product_id, product_title, quantity, unit_price_cents, currency)
    values (p_organization_id, v_order.id, v_product.id, v_product.title, v_quantity, v_product.price_cents, v_product.currency);
    v_total := v_total + (v_product.price_cents * v_quantity);
  end loop;
  update public.sales_orders set total_cents = v_total, updated_at = now() where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.fn_create_sales_order(uuid, uuid, uuid, jsonb, text, uuid, text) from public, anon;

grant execute on function public.fn_create_sales_order(uuid, uuid, uuid, jsonb, text, uuid, text) to authenticated, service_role;

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check
  check (provider = any (array['waha'::text, 'nuvemshop'::text, 'generic'::text, 'evolution_go'::text]));

create unique index if not exists webhook_events_log_evolution_external_unique
  on public.webhook_events_log (provider, external_id)
  where provider = 'evolution_go' and external_id is not null;

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

alter table public.sales_orders drop constraint if exists sales_orders_check;

alter table public.sales_orders drop constraint if exists sales_orders_check1;

alter table public.sales_orders drop constraint if exists sales_orders_payee_a_un_auteur;

alter table public.sales_orders add constraint sales_orders_payee_a_un_auteur
  check (status <> 'payée' or (paid_at is not null and paid_by_user_id is not null));

alter table public.sales_orders drop constraint if exists sales_orders_paiement_seulement_si_payee;

alter table public.sales_orders add constraint sales_orders_paiement_seulement_si_payee
  check (paid_at is null or status in ('payée', 'a_livrer', 'livree'));

alter table public.ai_agent_versions
  alter column handoff_keywords
  set default array['parler à un humain', 'conseiller', 'vraie personne']::text[];

alter table public.ai_chunks alter column embedding drop not null;

alter table public.ai_chunks
  add column if not exists contenu_recherche tsvector
  generated always as (
    to_tsvector(
      'french'::regconfig,
      translate(lower(content), 'àâäáãéèêëíîïìóôöõòúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
    )
  ) stored;

create index if not exists ai_chunks_contenu_recherche_idx
  on public.ai_chunks using gin (contenu_recherche);

create or replace function public.rechercher_chunks_texte(
  p_organization_id uuid,
  p_kb_version_id uuid,
  p_requete text,
  p_k integer default 4
) returns table (
  chunk_id uuid,
  knowledge_source_id uuid,
  content text,
  similarity real,
  metadata jsonb
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with q as (
    -- Les racines de la question, en OU, sans mots vides ni racines d'une ou
    -- deux lettres (« à » sans accent devient « a », et « a » est partout).
    select nullif(
      array_to_string(array(
        select quote_literal(l)
          from unnest(tsvector_to_array(to_tsvector(
                 'french'::regconfig,
                 translate(lower(coalesce(p_requete, '')), 'àâäáãéèêëíîïìóôöõòúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
               ))) as l
         where length(l) >= 3
      ), ' | '),
      ''
    )::tsquery as tsq
  )
  select c.id,
         c.knowledge_source_id,
         c.content,
         ts_rank_cd(c.contenu_recherche, q.tsq, 32)::real as similarity,
         c.metadata
    from public.ai_chunks c, q
   where c.organization_id = p_organization_id
     and c.kb_version_id = p_kb_version_id
     and q.tsq is not null
     and c.contenu_recherche @@ q.tsq
   order by similarity desc, c.position asc
   limit least(greatest(coalesce(p_k, 4), 0), 8);
$$;

revoke execute on function public.rechercher_chunks_texte(uuid, uuid, text, integer) from public, anon;

grant  execute on function public.rechercher_chunks_texte(uuid, uuid, text, integer) to authenticated, service_role;

insert into public.ai_models
  (provider, model_id, display_name, context_window,
   input_price_per_million_cents, output_price_per_million_cents,
   supports_tools, is_default_for_provider)
values
  ('deepseek', 'deepseek-flash', 'Assistant', 1000000, 30, 120, true, true)
on conflict (provider, model_id) do update
  set input_price_per_million_cents  = excluded.input_price_per_million_cents,
      output_price_per_million_cents = excluded.output_price_per_million_cents,
      supports_tools                 = excluded.supports_tools;

update public.organizations
   set display_name = 'Mon entreprise'
 where display_name in ('Minha empresa', 'Minha Empresa');

update public.crm_pipelines
   set name = 'Commandes'
 where slug = 'pedidos' and name = 'Pedidos';

update public.crm_stages s
   set name = v.fr
  from (values
    ('carrinho_abandonado',  'Carrinho abandonado',  'Panier abandonné'),
    ('aguardando_pagamento', 'Aguardando pagamento', 'Paiement attendu'),
    ('pago',                 'Pago',                 'Payée'),
    ('em_separacao',         'Em separação',         'En préparation'),
    ('enviado',              'Enviado',              'Expédiée'),
    ('entregue',             'Entregue',             'Livrée'),
    ('pos_venda',            'Pós-venda',            'Après-vente'),
    ('cancelado',            'Cancelado',            'Annulée')
  ) as v(slug, pt, fr)
 where s.slug = v.slug and s.name = v.pt;

do $skills$
declare
  v_id uuid;
begin
  if exists (
    select 1
      from skill_pointers p
      join skill_versions v on v.id = p.version_id
     where p.organization_id is null and p.name = 'objecao-preco'
       and v.description like 'Playbook pra contornar objeção de preço%'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'objecao-preco',
      'Playbook pour traiter l’objection sur le prix sur WhatsApp — identifie la vraie raison derrière le « c’est cher » avant de réagir, sans accorder de remise non autorisée.',
      $body$# Playbook : traiter l’objection sur le prix
## Quand l’utiliser
Le lead a réagi au prix avec résistance — directe (« c’est cher ») ou indirecte (il a
demandé une remise, comparé avec un concurrent, disparu après avoir vu le prix). Objectif :
comprendre l’objection réelle derrière le « c’est cher » avant de réagir, et ne jamais
accorder une remise que l’organisation n’a pas autorisée.
## D’abord le diagnostic — « cher » ne concerne presque jamais le chiffre
Avant de répondre, identifiez QUELLE objection se cache derrière :
1. **Budget réellement insuffisant** — « je n’ai pas ce montant maintenant », « c’est hors de mon budget »
2. **N’a pas encore perçu la valeur** — « pourquoi ça coûte ça ? », silence après le prix, comparaison vague
3. **Comparaison avec un concurrent / une option moins chère** — « j’ai vu moins cher chez [X] »
4. **Tactique de négociation** — demande une remise d’emblée, sans avoir rien demandé sur le produit
5. **Timing** — « je vais réfléchir », « je dois voir avec [associé/conjoint] » déguisé en objection de prix
Si le message ne permet pas de diagnostiquer, DEMANDEZ avant d’argumenter : « Pour mieux
vous aider — c’est le montant en lui-même, ou vous attendiez autre chose que ce que je
vous ai proposé ? »
## Si-alors selon le diagnostic
**SI budget réellement insuffisant :**
- N’insistez pas sur le prix plein. Proposez : paiement échelonné, offre d’entrée, version
  réduite — UNIQUEMENT ce qui est documenté comme option légitime dans la base de
  connaissances.
- N’inventez JAMAIS un échelonnement ou une remise non documentés — si vous ne connaissez
  pas la politique, passez la main à un humain.
- Ne dévalorisez pas le lead parce qu’il n’a pas le budget. C’est une information, pas un refus.
**SI la valeur n’est pas encore perçue :**
- Ne répétez pas le prix. Mettez en avant le résultat concret pour le client (pas la liste
  des fonctionnalités).
- Utilisez un chiffre ou une preuve sociale réelle si la base de connaissances en contient.
- Question de relance : « Est-ce que ce que cela résout vous parle, ou il reste un doute sur
  ce qui est inclus ? »
**SI comparaison avec un concurrent :**
- N’attaquez pas le concurrent. Demandez ce qu’il a vu de différent (« qu’est-ce qu’il y
  avait dans cette autre option ? ») — cela révèle souvent si c’est vraiment le prix ou un
  autre critère (délai, assistance, garantie).
- Mettez en avant le vrai point fort de l’entreprise (ce que la base de connaissances dit de
  son positionnement), pas un argument générique.
**SI tactique de négociation (remise demandée sans contexte) :**
- Ne cédez pas automatiquement. Demandez ce qui permettrait de conclure aujourd’hui —
  cela révèle souvent le montant réel que le lead a en tête.
- Remise UNIQUEMENT si l’organisation a une politique documentée dans la base de
  connaissances pour ce cas. Sinon, relais humain — une décision de prix hors script
  revient à un humain.
**SI c’est un timing déguisé (« je vais réfléchir ») :**
- Ne mettez pas la pression. Demandez simplement ce qui manque pour décider (« qu’est-ce
  qui vous aiderait à décider plus sereinement ? »).
- Planifiez une relance explicite (date/heure), ne laissez pas en suspens — un lead qui « va
  réfléchir » sans relance planifiée refroidit.
## Règles strictes
- Ne promettez jamais de remise, de cadeau ou de condition spéciale qui ne figure pas dans la
  base de connaissances ou dans la configuration de l’agent.
- Ne mentez jamais sur une « promotion qui se termine aujourd’hui » et ne créez pas de fausse urgence.
- Si le lead devient hostile, menace d’annuler ou demande à parler à un humain — relais
  immédiat, sans insister une fois de plus.
- Si après 2 échanges l’objection n’est pas levée, proposez explicitement le relais :
  « Voulez-vous que je demande à quelqu’un de l’équipe de finaliser les détails avec vous ? »
## Exemples de réponse (le ton, pas à copier mot pour mot)
- « Je comprends — avant de vous proposer autre chose, dites-moi : c’est le montant en
  lui-même ou vous attendiez autre chose que ce que je vous ai montré ? »
- « C’est entendu. Pour le montant, nous avons aujourd’hui [option documentée]. Est-ce que
  cela vous conviendrait mieux en ce moment ? »
- « Très bien, je vérifie avec vous : qu’est-ce qui vous permettrait de conclure aujourd’hui ? »
## Ce qu’il ne faut PAS faire
- Ne renvoyez pas la liste des prix sans contexte.
- N’ignorez pas l’objection pour changer de sujet.
- N’utilisez pas de formules de pression comme « seulement aujourd’hui » si cette condition n’existe pas vraiment.
$body$,
      '{"any_keywords": ["cher", "c''est cher", "trop cher", "remise", "réduction", "baisser le prix", "moins cher", "j''ai vu moins cher", "hors de mon budget", "pas dans mon budget", "prix élevé", "promo"], "probe_keywords": ["combien", "quel est le prix", "c''est combien", "paiement en plusieurs fois", "conditions de paiement", "moyen de paiement"]}'::jsonb
    )
    returning id into v_id;
    update skill_pointers
       set version_id = v_id, updated_at = now()
     where organization_id is null and name = 'objecao-preco';
  end if;
  if exists (
    select 1
      from skill_pointers p
      join skill_versions v on v.id = p.version_id
     where p.organization_id is null and p.name = 'agendamento'
       and v.description like 'Playbook pra marcar/remarcar horário%'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (
      null,
      'agendamento',
      'Playbook pour fixer ou déplacer un rendez-vous (consultation, visite, séance) — propose des créneaux concrets de l’agenda réel, n’invente jamais de disponibilité, confirme par écrit avant de conclure.',
      $body$# Playbook : prise de rendez-vous
## Quand l’utiliser
Le lead demande à fixer un rendez-vous, une consultation, une visite, une démonstration ou
une séance — tout engagement avec une date et une heure. Fréquent dans les cliniques,
l’immobilier (visites), les services et le conseil.
## Règle d’or : ne jamais inventer de disponibilité
Si l’agent n’a pas d’accès confirmé à l’agenda réel de l’entreprise (intégration ou
consultation des disponibilités), NE proposez PAS d’horaire précis. Dites que vous allez
vérifier et passez la main, ou demandez la préférence du lead en indiquant que la
confirmation suivra. Promettre un horaire qui n’existe pas casse la confiance et oblige à
reprogrammer.
## Déroulé standard (si-alors)
**1. Identifiez le service/motif avant de proposer un horaire**
- SI le lead a seulement dit « je veux un rendez-vous » sans contexte → demandez d’abord le
  motif/service. Réserver sans savoir quoi crée des erreurs (ex. : une consultation de
  20 min placée sur un créneau d’1 h de soin).
**2. Proposez des options fermées, pas une question ouverte**
- SI vous avez accès à l’agenda réel → proposez 2 ou 3 créneaux concrets (« j’ai mardi 14h
  ou mercredi 10h, lequel vous convient ? »). Une question ouverte comme « quel horaire
  préférez-vous ? » crée des allers-retours inutiles.
- SI vous n’avez pas accès à l’agenda → n’inventez pas. Dites par exemple « je vérifie les
  disponibilités et je reviens vers vous dans un instant », et signalez le relais à la
  personne qui y a accès.
**3. Recueillez les informations obligatoires avant de confirmer**
- Nom complet du lead (ou confirmez celui déjà présent dans le CRM).
- Service/motif précis.
- Agence/lieu, si l’entreprise en a plusieurs.
- En cas de report, l’ancien horaire à remplacer.
**4. Confirmez par écrit avant de clôturer**
- SI le lead accepte un horaire → reformulez par écrit : « Confirmé : [service] le [date]
  à [heure], à [lieu]. Vous me le confirmez ? »
- Ne considérez le rendez-vous comme fixé qu’après un « oui » explicite du lead — un
  silence ou un « ok » vague ne suffit pas quand une absence coûte cher.
**5. Report et annulation**
- SI le lead demande à déplacer → traitez-le comme un nouveau rendez-vous : demandez le
  nouvel horaire et annulez/remplacez explicitement l’ancien (ne laissez pas les deux).
- SI le lead demande à annuler → confirmez l’annulation et proposez de reprogrammer,
  sans insister.
**6. Risque d’absence**
- Si l’entreprise a une politique de confirmation la veille documentée dans la base de
  connaissances, suivez-la. Sinon, n’inventez pas de politique — confirmez simplement le
  rendez-vous.
## Règles strictes
- Ne confirmez jamais un horaire sans avoir vérifié la disponibilité réelle (ou sans
  indiquer que la confirmation reste à venir).
- Ne fixez jamais deux rendez-vous en conflit pour le même lead sans le signaler.
- Si le lead demande un horaire hors des heures d’ouverture et que les règles de
  l’entreprise ne le prévoient pas, ne confirmez pas — expliquez les horaires réels.
- Une donnée sensible (adresse complète, pièce d’identité) n’est demandée que si le
  processus de l’entreprise l’exige vraiment.
## Exemples de réponse (le ton, pas à copier mot pour mot)
- « Pour bien vous placer : c’est pour quel service/motif ? »
- « J’ai jeudi à 15h ou vendredi à 9h — qu’est-ce qui vous arrange le mieux ? »
- « Confirmé : consultation le 28/07 à 15h, à l’agence du centre. Vous me le confirmez ? »
## Ce qu’il ne faut PAS faire
- Ne demandez pas « quel horaire préférez-vous ? » sans proposer d’options concrètes quand
  vous avez l’agenda.
- Ne confirmez pas un rendez-vous sans réponse explicite du lead.
- N’inventez pas une disponibilité que vous n’avez pas vérifiée.
$body$,
      '{"any_keywords": ["rendez-vous", "prendre rendez-vous", "réserver", "fixer un rendez-vous", "une visite", "agenda", "à quelle heure", "créneau", "disponibilité", "reporter", "décaler", "annuler le rendez-vous"], "probe_keywords": ["quelle heure", "quel jour", "vous êtes ouverts", "disponible"]}'::jsonb
    )
    returning id into v_id;
    update skill_pointers
       set version_id = v_id, updated_at = now()
     where organization_id is null and name = 'agendamento';
  end if;
end
$skills$;

alter table if exists public.organizations      alter column timezone set default 'Africa/Douala';

alter table if exists public.organizations      alter column locale   set default 'fr-FR';

alter table if exists public.ai_faq_items       alter column locale   set default 'fr-FR';

alter table if exists public.crm_leads          alter column currency set default 'XAF';

alter table if exists public.orders             alter column currency set default 'XAF';

alter table if exists public.products           alter column currency set default 'XAF';

alter table if exists public.sales_orders       alter column currency set default 'XAF';

alter table if exists public.sales_order_items  alter column currency set default 'XAF';

do $$
declare
  f record;
  tinha_auth boolean;
  tinha_service boolean;
begin
  if to_regrole('anon') is null then
    return;
  end if;
  for f in
    select p.oid, p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    tinha_auth := to_regrole('authenticated') is not null
                  and has_function_privilege('authenticated', f.oid, 'EXECUTE');
    tinha_service := to_regrole('service_role') is not null
                     and has_function_privilege('service_role', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if tinha_auth then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
    if tinha_service then
      execute format('grant execute on function %s to service_role', f.assinatura);
    end if;
  end loop;
end $$;

revoke execute on function public.fn_audit_log_row() from authenticated;

revoke execute on function public.fn_decrypt_oauth(bytea) from authenticated;

revoke execute on function public.fn_encrypt_oauth(text) from authenticated;

revoke execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) from authenticated;

revoke execute on function public.fn_update_budget_consumption() from authenticated;

grant execute on function public.fn_audit_log_row() to service_role;

grant execute on function public.fn_decrypt_oauth(bytea) to service_role;

grant execute on function public.fn_encrypt_oauth(text) to service_role;

grant execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) to service_role;

grant execute on function public.fn_update_budget_consumption() to service_role;

